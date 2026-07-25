import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authzConfig,
  isSatisfied,
  requireAuthorization,
  type AuthTier,
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
  storageFromEnv,
  toHistoryEntries,
  uploadBlob,
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
} from "./db";
import { buildObservation, detectAnomaly } from "./detect";

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
    const res = await fetch(`${MCP_ENDPOINT}/get_history`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId, operator }),
    });
    if (!res.ok) throw new Error(`MCP get_history HTTP ${res.status}`);
    const body = (await res.json()) as { entries: ReturnType<typeof toHistoryEntries> };
    return body.entries ?? [];
  }

  if (!SUBGRAPH_URL) return [];
  const result = await getHistory(SUBGRAPH_URL, nodeId, operator);
  return toHistoryEntries(result);
}

async function processResolvedGates(supabase: SupabaseClient): Promise<void> {
  const { data: gates } = await supabase
    .from("human_gates")
    .select("*, proposals(*)")
    .eq("status", "resolved")
    .is("resolved_tx_hash", null)
    .limit(5);

  for (const gate of gates ?? []) {
    const proposal = gate.proposals as {
      id: number;
      node_id: string;
      proposed_action: string;
    } | null;
    if (!proposal) continue;

    const { data: approvals } = await supabase
      .from("human_approvals")
      .select("nullifier,operator,chosen_action,ts")
      .eq("gate_id", gate.id);

    const chosen =
      gate.chosen_action ??
      (approvals ?? [])[0]?.chosen_action ??
      proposal.proposed_action;

    await finalizeCommit(
      supabase,
      proposal.id,
      chosen,
      gate.required_tier as AuthTier,
      (approvals ?? []).map((a) => ({
        nullifier: a.nullifier,
        operator: a.operator,
        chosenAction: a.chosen_action ?? chosen,
        ts: Number(a.ts),
      })),
      gate.id
    );
  }
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
    const uploaded = await uploadBlob(storage, payload);
    zerogRoot = uploaded.rootHash;
  }

  const registry = registryFromEnv();
  let chainTxHash: string | undefined;

  if (registry && approvals.length > 0) {
    chainTxHash = await commitDecision(registry, {
      id: `proposal-${proposalId}`,
      nodeId: proposal.node_id ?? "",
      operator: node?.operator_id ?? "",
      action: appliedAction,
      verdict: verdict?.verdict ?? "VERIFIED",
      authTier,
      zerogRoot,
    });
  } else if (registry) {
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

  if (proposal.node_id) {
    await applyActionToGrid(
      supabase,
      appliedAction,
      (proposal.target_nodes as string[]) ?? [proposal.node_id]
    );
    await supabase
      .from("nodes")
      .update({ status: "healthy", updated_at: new Date().toISOString() })
      .eq("id", proposal.node_id);
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
    `committed ${appliedAction} for proposal ${proposalId}`,
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

  reasoning = true;
  const fingerprintAtStart = await gridFingerprint(supabase);
  const observationId = randomUUID();

  try {
    const telemetry = await fetchTelemetryWindow(supabase, detection.nodeId);
    const history = await fetchHistory(detection.nodeId, detection.operator);
    const observation = buildObservation(
      observationId,
      state,
      telemetry,
      history
    );

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

    const fingerprintMid = await gridFingerprint(supabase);
    if (fingerprintMid !== fingerprintAtStart) {
      await logEvent(supabase, "stale", "grid state changed during reasoning", detection.nodeId);
      return;
    }

    const proposal: Proposal = parsed.data;
    const verdict = verifyConstraints(state, proposal);

    const authzCtx = SUBGRAPH_URL
      ? await fetchAuthzContext(SUBGRAPH_URL, detection.nodeId, [])
      : { incidentCount: 0, overrideCounts: {} };

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

    await openHumanGate(
      supabase,
      proposalRow.id,
      detection.nodeId,
      requirement
    );
  } finally {
    reasoning = false;
  }
}

async function pollGateSatisfaction(supabase: SupabaseClient): Promise<void> {
  const { data: gates } = await supabase
    .from("human_gates")
    .select("*")
    .eq("status", "pending")
    .limit(10);

  for (const gate of gates ?? []) {
    const { data: approvals } = await supabase
      .from("human_approvals")
      .select("nullifier,operator,chosen_action,ts")
      .eq("gate_id", gate.id);

    const collected: HumanApproval[] = (approvals ?? []).map((a) => ({
      nullifier: a.nullifier,
      operator: a.operator,
      chosenAction: a.chosen_action ?? "",
      ts: Number(a.ts),
    }));

    const requirement = requireAuthorization(
      {
        verdict: "VIOLATION_TRIGGERED",
        detail: gate.reason ?? "",
        projected: {},
      },
      (gate.operators_required as string[]) ?? [],
      gate.chosen_action ?? "ISOLATE_NODE",
      authzConfig,
      { incidentCount: 0, overrideCounts: {} }
    );

    requirement.tier = gate.required_tier as AuthTier;
    requirement.quorum = gate.required_quorum;
    requirement.operatorsRequired = (gate.operators_required as string[]) ?? [];

    if (!isSatisfied(requirement, collected)) continue;

    const chosen =
      gate.chosen_action ??
      collected[0]?.chosenAction ??
      "NO_OP";

    await supabase
      .from("human_gates")
      .update({ status: "resolved", chosen_action: chosen })
      .eq("id", gate.id);
  }
}

export async function startAgent(): Promise<() => void> {
  const supabase = createAdminClient();
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        await processResolvedGates(supabase);
        await pollGateSatisfaction(supabase);
        await runCycle(supabase);
      } catch (err) {
        console.error("[agent]", err instanceof Error ? err.message : err);
      }
      await new Promise((resolve) => setTimeout(resolve, LOOP_MS));
    }
  };

  void loop();
  console.log("[agent] loop started");

  return () => {
    running = false;
  };
}
