import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authzConfig,
  isSatisfied,
  maxTier,
  resolveGate,
  requireAuthorization,
  type AuthTier,
  type AuthorizationRequirement,
  type AuthzConfig,
  type AuthzContext,
  type HumanApproval,
  type Proposal,
} from "@verimesh/shared";
import {
  commitDecision,
  fetchAuthzContext,
  freezeNode,
  getHistory,
  proposeAction,
  registryFromEnv,
  resolveOverride,
  storageFromEnv,
  toHistoryEntries,
  uploadBlobOrSkip,
  withRetry,
  type ObservationPayload,
} from "@verimesh/chain";
import {
  affectedOperators,
  verifyConstraints,
} from "@verimesh/verifier";
import { ProposalSchema, validateProposalSemantics } from "@verimesh/shared";
import {
  applyActionToGrid,
  createAdminClient,
  fetchTelemetryWindow,
  gridFingerprint,
  loadGridState,
  logEvent,
  relevantNodeIds,
} from "./db";
import { buildObservation, detectAnomaly } from "./detect";
import { liveAuthzConfig } from "./demoSigners";

const HIGH_CONFIDENCE = 0.75;
const LOOP_MS = Number(process.env.AGENT_LOOP_MS ?? 8000);
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? "";
const HISTORY_VIA_MCP = process.env.HISTORY_VIA_MCP === "1";
const MCP_ENDPOINT = process.env.GRAPH_MCP_ENDPOINT ?? "http://127.0.0.1:8787";

let reasoning = false;

async function fetchHistory(
  nodeId: string,
  operator: string
): Promise<ReturnType<typeof toHistoryEntries>> {
  if (HISTORY_VIA_MCP) {
    return withRetry(
      async () => {
        const res = await fetch(`${MCP_ENDPOINT}/get_history`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nodeId, operator }),
        });
        if (!res.ok) throw new Error(`MCP get_history HTTP ${res.status}`);
        const body = (await res.json()) as { entries: ReturnType<typeof toHistoryEntries> };
        return body.entries ?? [];
      },
      { label: "mcp-get-history", attempts: 2, timeoutMs: 10_000 }
    );
  }

  if (!SUBGRAPH_URL) return [];
  const result = await getHistory(SUBGRAPH_URL, nodeId, operator);
  return toHistoryEntries(result);
}

interface GateRow {
  id: number;
  proposal_id: number;
  status: string;
  chosen_action: string | null;
  required_tier: string;
  required_quorum: number;
  operators_required: string[] | null;
  reason: string | null;
}

const OPEN_GATE_STATUSES = ["pending", "authorized"];
const OBSERVATION_TELEMETRY_ROWS = Number(
  process.env.OBSERVATION_TELEMETRY_ROWS ?? 8
);
const LLM_MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS ?? 35_000);
const NODE_ACTION_COOLDOWN_MS = Number(
  process.env.NODE_ACTION_COOLDOWN_MS ?? 180_000
);
const GATE_LOOP_MS = Number(process.env.AGENT_GATE_LOOP_MS ?? 2000);
const COMMIT_LOOP_MS = Number(process.env.AGENT_COMMIT_LOOP_MS ?? 2000);
const COMMIT_ATTEMPTS = Number(process.env.AGENT_COMMIT_ATTEMPTS ?? 3);
const commitAttempts = new Map<number, number>();
let lastLlmCallAt = 0;
let cooldownAnnounced = false;
const gateHoldAnnounced = new Set<number>();
const lastActionByNode = new Map<string, number>();
const settlingAnnounced = new Set<string>();

function accountableRequirement(
  requirement: AuthorizationRequirement,
  operator: string,
  confidence: number
): AuthorizationRequirement {
  if (requirement.tier !== "T0_AUTONOMOUS") return requirement;

  const operators =
    requirement.operatorsRequired.length > 0
      ? requirement.operatorsRequired
      : operator
        ? [operator]
        : [];

  const tier = maxTier("T1_SINGLE", requirement.tier);

  return {
    tier,
    quorum: Math.max(1, operators.length),
    operatorsRequired: operators,
    reason: `${requirement.reason} · held for a human anyway: the proposer's confidence ${confidence.toFixed(2)} is under the ${HIGH_CONFIDENCE} an autonomous commit requires`,
  };
}

function gateRequirement(gate: GateRow): AuthorizationRequirement {
  return {
    tier: gate.required_tier as AuthTier,
    quorum: gate.required_quorum,
    operatorsRequired: (gate.operators_required as string[]) ?? [],
    reason: gate.reason ?? "",
  };
}

async function collectedApprovals(
  supabase: SupabaseClient,
  gateId: number
): Promise<HumanApproval[]> {
  const { data } = await supabase
    .from("human_approvals")
    .select("nullifier,operator,chosen_action,ts")
    .eq("gate_id", gateId)
    .order("ts", { ascending: true });

  return (data ?? []).map((row) => ({
    nullifier: row.nullifier as string,
    operator: row.operator as string,
    chosenAction: (row.chosen_action as string) ?? "",
    ts: Number(row.ts),
  }));
}

function allowlistIsEnforceable(config: AuthzConfig): boolean {
  return Object.values(config.operators).some((list) => list.length > 0);
}

function resolveCollected(
  requirement: AuthorizationRequirement,
  collected: HumanApproval[],
  context: AuthzContext
): ReturnType<typeof resolveGate> {
  const config = liveAuthzConfig();
  if (allowlistIsEnforceable(config)) {
    return resolveGate(requirement, collected, config, context);
  }
  return {
    resolved: isSatisfied(requirement, collected),
    accepted: collected,
    rejected: [],
  };
}

async function authzContextFor(
  nodeId: string,
  nullifiers: string[]
): Promise<AuthzContext> {
  if (!SUBGRAPH_URL) return { incidentCount: 0, overrideCounts: {} };
  try {
    return await fetchAuthzContext(SUBGRAPH_URL, nodeId, nullifiers);
  } catch (err) {
    console.error(
      "[agent] authz context unavailable",
      err instanceof Error ? err.message : err
    );
    return { incidentCount: 0, overrideCounts: {} };
  }
}

async function processResolvedGates(supabase: SupabaseClient): Promise<void> {
  const { data: gates } = await supabase
    .from("human_gates")
    .select("*, proposals(*)")
    .eq("status", "resolved")
    .is("resolved_tx_hash", null)
    .limit(5);

  for (const gate of (gates ?? []) as (GateRow & {
    proposals: { id: number; node_id: string; proposed_action: string } | null;
  })[]) {
    const proposal = gate.proposals;
    if (!proposal) continue;

    const { data: claimed } = await supabase
      .from("human_gates")
      .update({ status: "committing" })
      .eq("id", gate.id)
      .eq("status", "resolved")
      .select("id");

    if (!claimed?.length) continue;

    const collected = await collectedApprovals(supabase, gate.id);
    const requirement = gateRequirement(gate);
    const context = await authzContextFor(
      proposal.node_id ?? "",
      collected.map((approval) => approval.nullifier)
    );
    const resolution = resolveCollected(requirement, collected, context);

    if (!resolution.resolved) {
      await supabase
        .from("human_gates")
        .update({ status: "blocked" })
        .eq("id", gate.id);
      await logEvent(
        supabase,
        "reject",
        `gate ${gate.id} was marked resolved but the policy does not accept it: ${resolution.rejected
          .map((r) => r.rejection)
          .join(", ") || "quorum not met"}`,
        proposal.node_id ?? undefined
      );
      continue;
    }

    const chosen =
      gate.chosen_action ??
      resolution.accepted[0]?.chosenAction ??
      proposal.proposed_action;

    try {
      await finalizeCommit(
        supabase,
        proposal.id,
        chosen,
        requirement.tier,
        resolution.accepted.map((approval) => ({
          ...approval,
          chosenAction: approval.chosenAction || chosen,
        })),
        gate.id
      );
      commitAttempts.delete(gate.id);
    } catch (err) {
      await releaseGate(supabase, gate, err, proposal.node_id ?? undefined);
    }
  }
}

async function releaseGate(
  supabase: SupabaseClient,
  gate: GateRow,
  err: unknown,
  nodeId?: string
): Promise<void> {
  const attempts = (commitAttempts.get(gate.id) ?? 0) + 1;
  commitAttempts.set(gate.id, attempts);
  const detail = err instanceof Error ? err.message : String(err);
  const exhausted = attempts >= COMMIT_ATTEMPTS;

  await supabase
    .from("human_gates")
    .update({ status: exhausted ? "blocked" : "resolved" })
    .eq("id", gate.id);

  await logEvent(
    supabase,
    "reject",
    exhausted
      ? `gate ${gate.id} could not be committed after ${attempts} attempts and is blocked: ${detail}`
      : `gate ${gate.id} commit attempt ${attempts} of ${COMMIT_ATTEMPTS} failed, returning it to resolved to retry: ${detail}`,
    nodeId
  );

  console.error(
    `[agent] gate ${gate.id} commit attempt ${attempts} failed: ${detail}`
  );
}

async function finalizeCommit(
  supabase: SupabaseClient,
  proposalId: number,
  appliedAction: string,
  authTier: AuthTier,
  approvals: HumanApproval[],
  gateId?: number
): Promise<void> {
  const { data: proposal } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();

  if (!proposal) return;

  const { data: verdict } = await supabase
    .from("verdicts")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  const { data: node } = proposal.node_id
    ? await supabase
        .from("nodes")
        .select("operator_id")
        .eq("id", proposal.node_id)
        .maybeSingle()
    : { data: null };

  const blob = {
    version: 1,
    proposalId,
    proposal,
    verdict,
    authTier,
    approvals,
    ts: Date.now(),
  };

  let zerogRoot = "";
  const storage = storageFromEnv();
  if (storage) {
    const payload = new TextEncoder().encode(JSON.stringify(blob, null, 2));
    const uploaded = await uploadBlobOrSkip(storage, payload);
    zerogRoot = uploaded?.rootHash ?? "";
  }

  const registry = registryFromEnv();
  let chainTxHash: string | undefined;

  if (registry && approvals.length > 0) {
    await resolveOverride(registry, {
      id: `proposal-${proposalId}`,
      chosenAction: appliedAction,
      nullifiers: approvals.map((a) => a.nullifier),
      operators: approvals.map((a) => a.operator),
    });
  }

  if (registry) {
    chainTxHash = await commitDecision(registry, {
      id: `proposal-${proposalId}`,
      nodeId: proposal.node_id ?? "",
      operator: node?.operator_id ?? "",
      action: appliedAction,
      verdict: verdict?.verdict ?? "VERIFIED",
      authTier,
      zerogRoot,
    });
  }

  if (proposal.node_id) {
    lastActionByNode.set(proposal.node_id, Date.now());
  }

  await supabase.from("commits").insert({
    proposal_id: proposalId,
    applied_action: appliedAction,
    zerog_root: zerogRoot || null,
    chain_tx_hash: chainTxHash ?? null,
    auth_tier: authTier,
    human_authorized: approvals.length > 0,
    ts: Date.now(),
  });

  await supabase
    .from("proposals")
    .update({ zerog_root: zerogRoot || null, auth_tier: authTier })
    .eq("id", proposalId);

  let effect = "";
  if (proposal.node_id) {
    const targets = (proposal.target_nodes as string[]) ?? [proposal.node_id];
    const change = await applyActionToGrid(supabase, appliedAction, targets);
    effect =
      change.applied.length > 0
        ? ` — ${change.applied.join(", ")} moved to the state the verifier projected`
        : ` — nothing moved: ${change.reason}`;

    if (appliedAction !== "ISOLATE_NODE") {
      await supabase
        .from("nodes")
        .update({ status: "healthy", updated_at: new Date().toISOString() })
        .eq("id", proposal.node_id)
        .eq("status", "awaiting_human");
    }
  }

  if (gateId) {
    await supabase
      .from("human_gates")
      .update({ status: "committed", resolved_tx_hash: chainTxHash ?? null })
      .eq("id", gateId);
  }

  await logEvent(
    supabase,
    "commit",
    `committed ${appliedAction} for proposal ${proposalId}${effect}`,
    proposal.node_id ?? undefined
  );
}

async function openHumanGate(
  supabase: SupabaseClient,
  proposalId: number,
  nodeId: string,
  requirement: ReturnType<typeof requireAuthorization>
): Promise<void> {
  await supabase.from("human_gates").insert({
    proposal_id: proposalId,
    status: "pending",
    ts: Date.now(),
    required_tier: requirement.tier,
    required_quorum: requirement.quorum,
    operators_required: requirement.operatorsRequired,
    reason: requirement.reason,
  });

  await supabase
    .from("nodes")
    .update({ status: "awaiting_human", updated_at: new Date().toISOString() })
    .eq("id", nodeId);

  const registry = registryFromEnv();
  if (registry) {
    const { data: node } = await supabase
      .from("nodes")
      .select("operator_id")
      .eq("id", nodeId)
      .maybeSingle();

    await freezeNode(registry, {
        id: `proposal-${proposalId}`,
        nodeId,
        operator: node?.operator_id ?? "",
        reason: requirement.reason,
        requiredTier: requirement.tier,
        requiredQuorum: requirement.quorum,
      });
  }

  await logEvent(
    supabase,
    "freeze",
    requirement.reason,
    nodeId
  );
}

async function runCycle(supabase: SupabaseClient): Promise<void> {
  if (reasoning) return;

  const state = await loadGridState(supabase);
  const detection = detectAnomaly(state);
  if (detection.kind === "NO_OP") return;

  const actedAt = lastActionByNode.get(detection.nodeId) ?? 0;
  const sinceAction = Date.now() - actedAt;
  if (actedAt > 0 && sinceAction < NODE_ACTION_COOLDOWN_MS) {
    if (!settlingAnnounced.has(detection.nodeId)) {
      console.log(
        `[agent] ${detection.nodeId} was just acted on — settling for ${Math.ceil(
          (NODE_ACTION_COOLDOWN_MS - sinceAction) / 1000
        )}s before reasoning about it again`
      );
      settlingAnnounced.add(detection.nodeId);
    }
    return;
  }
  settlingAnnounced.delete(detection.nodeId);

  const sinceLastLlm = Date.now() - lastLlmCallAt;
  if (lastLlmCallAt > 0 && sinceLastLlm < LLM_MIN_INTERVAL_MS) {
    if (!cooldownAnnounced) {
      console.log(
        `[agent] holding ${detection.nodeId} — 0G token budget cooldown, ${Math.ceil(
          (LLM_MIN_INTERVAL_MS - sinceLastLlm) / 1000
        )}s left`
      );
      cooldownAnnounced = true;
    }
    return;
  }
  cooldownAnnounced = false;

  reasoning = true;
  const watchedNodeIds = relevantNodeIds(state, detection.nodeId);
  const fingerprintAtStart = await gridFingerprint(supabase, watchedNodeIds);
  const observationId = randomUUID();

  try {
    const telemetry = await fetchTelemetryWindow(
      supabase,
      detection.nodeId,
      OBSERVATION_TELEMETRY_ROWS
    );
    const history = await fetchHistory(detection.nodeId, detection.operator);
    const watched = new Set(watchedNodeIds);
    const observation = buildObservation(
      observationId,
      {
        nodes: state.nodes.filter((n) => watched.has(n.id)),
        edges: state.edges.filter(
          (e) => watched.has(e.from) || watched.has(e.to)
        ),
      },
      telemetry,
      history
    );

    lastLlmCallAt = Date.now();
    const llm = await proposeAction(observation as ObservationPayload);
    const parsed = ProposalSchema.safeParse(llm.proposal);
    if (!parsed.success) {
      await logEvent(supabase, "reject", "LLM schema invalid", detection.nodeId);
      return;
    }

    const semantic = validateProposalSemantics(parsed.data, state);
    if (semantic) {
      await logEvent(
        supabase,
        "reject",
        `semantic guardrail: ${semantic}`,
        detection.nodeId
      );
      return;
    }

    const fingerprintMid = await gridFingerprint(supabase, watchedNodeIds);
    if (fingerprintMid !== fingerprintAtStart) {
      await logEvent(supabase, "stale", "grid state changed during reasoning", detection.nodeId);
      return;
    }

    const proposal: Proposal = parsed.data;
    const verdict = verifyConstraints(state, proposal);

    const authzCtx = await authzContextFor(detection.nodeId, []);

    const requirement = requireAuthorization(
      verdict,
      affectedOperators(verdict),
      proposal.proposed_action,
      authzConfig,
      authzCtx
    );

    const ts = Date.now();
    const { data: proposalRow, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        ts,
        node_id: detection.nodeId,
        diagnosis: proposal.diagnosis,
        proposed_action: proposal.proposed_action,
        target_nodes: proposal.target_nodes,
        expected_effect: proposal.expected_effect,
        confidence: proposal.confidence,
        risk_flags: proposal.risk_flags,
        llm_provider: llm.provider,
        zerog_inference_valid: llm.zerogInferenceValid,
        auth_tier: requirement.tier,
      })
      .select("id")
      .single();

    if (proposalError) throw proposalError;

    await supabase.from("verdicts").insert({
      proposal_id: proposalRow.id,
      verdict: verdict.verdict,
      detail: verdict.detail,
      violated: verdict.violated ?? null,
      projected: verdict.projected,
      ts: ts + 1,
    });

    await logEvent(
      supabase,
      "history",
      JSON.stringify(history.slice(0, 3)),
      detection.nodeId
    );

    const autonomous =
      verdict.verdict === "VERIFIED" &&
      requirement.tier === "T0_AUTONOMOUS" &&
      proposal.confidence >= HIGH_CONFIDENCE;

    if (autonomous) {
      await finalizeCommit(
        supabase,
        proposalRow.id,
        proposal.proposed_action,
        requirement.tier,
        []
      );
      return;
    }

    const gated = accountableRequirement(
      requirement,
      detection.operator,
      proposal.confidence
    );

    if (gated.tier !== requirement.tier) {
      await supabase
        .from("proposals")
        .update({ auth_tier: gated.tier })
        .eq("id", proposalRow.id);
    }

    await openHumanGate(supabase, proposalRow.id, detection.nodeId, gated);
  } finally {
    reasoning = false;
  }
}

async function pollGateSatisfaction(supabase: SupabaseClient): Promise<void> {
  const { data: gates } = await supabase
    .from("human_gates")
    .select("*, proposals(node_id,proposed_action)")
    .in("status", OPEN_GATE_STATUSES)
    .limit(10);

  for (const gate of (gates ?? []) as (GateRow & {
    proposals: { node_id: string; proposed_action: string } | null;
  })[]) {
    const collected = await collectedApprovals(supabase, gate.id);
    if (collected.length === 0) continue;

    const requirement = gateRequirement(gate);
    const context = await authzContextFor(
      gate.proposals?.node_id ?? "",
      collected.map((approval) => approval.nullifier)
    );
    const resolution = resolveCollected(requirement, collected, context);

    if (!resolution.resolved) {
      if (!gateHoldAnnounced.has(gate.id)) {
        gateHoldAnnounced.add(gate.id);
        await logEvent(
          supabase,
          "reject",
          `gate ${gate.id} holds with ${collected.length} of ${requirement.quorum} accepted — ${
            resolution.rejected.map((r) => r.rejection).join(", ") ||
            "quorum not met"
          }`,
          gate.proposals?.node_id ?? undefined
        );
      }
      continue;
    }

    gateHoldAnnounced.delete(gate.id);

    const chosen =
      gate.chosen_action ??
      resolution.accepted[0]?.chosenAction ??
      gate.proposals?.proposed_action ??
      "NO_OP";

    await supabase
      .from("human_gates")
      .update({ status: "resolved", chosen_action: chosen })
      .eq("id", gate.id);

    await logEvent(
      supabase,
      "override",
      `gate ${gate.id} resolved by ${resolution.accepted.length} distinct human${resolution.accepted.length === 1 ? "" : "s"} — releasing ${chosen}`,
      gate.proposals?.node_id ?? undefined
    );
  }
}

export async function startAgent(): Promise<() => void> {
  const supabase = createAdminClient();
  let running = true;

  const spawn = (
    label: string,
    intervalMs: number,
    work: () => Promise<void>
  ) => {
    void (async () => {
      while (running) {
        try {
          await work();
        } catch (err) {
          console.error(`[agent:${label}]`, err instanceof Error ? err.message : err);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    })();
  };

  spawn("gates", GATE_LOOP_MS, () => pollGateSatisfaction(supabase));
  spawn("commits", COMMIT_LOOP_MS, () => processResolvedGates(supabase));
  spawn("reason", LOOP_MS, () => runCycle(supabase));

  console.log(
    `[agent] loops started — gates every ${GATE_LOOP_MS}ms, commits every ${COMMIT_LOOP_MS}ms, reasoning every ${LOOP_MS}ms`
  );

  return () => {
    running = false;
  };
}
