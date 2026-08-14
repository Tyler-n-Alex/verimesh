import type { HistoryEntry } from "@verimesh/shared";
import type {
  CommitRow,
  EventRow,
  GateRow,
  ProposalRow,
  VerdictRow,
} from "@/lib/db";
import type { MeshState } from "@/store/mesh";

export type StepKey =
  | "telemetry"
  | "detect"
  | "history"
  | "propose"
  | "verify"
  | "resolve";

export type StepState = "idle" | "active" | "done" | "blocked" | "failed";

export interface TraceStep {
  key: StepKey;
  label: string;
  state: StepState;
  headline: string | null;
  ts: number | null;
}

export interface CitedHistory {
  entries: HistoryEntry[];
  raw: string;
  parsed: boolean;
  ts: number;
}

export type PendingKind = "reasoning" | "committing";

export interface TraceCycle {
  proposal: ProposalRow | null;
  verdict: VerdictRow | null;
  commit: CommitRow | null;
  gate: GateRow | null;
  steps: TraceStep[];
  cited: CitedHistory | null;
  nodeId: string | null;
  pending: { kind: PendingKind; label: string } | null;
}

const STEP_LABELS: Record<StepKey, string> = {
  telemetry: "Telemetry",
  detect: "Detect anomaly",
  history: "Retrieve history",
  propose: "Diagnose and propose",
  verify: "Verify constraints",
  resolve: "Commit or freeze",
};

const IDLE_HINTS: Record<StepKey, string> = {
  telemetry: "Waiting for the next telemetry window.",
  detect: "Deterministic rules — no LLM on this step.",
  history: "Will query the subgraph for this node's prior incidents.",
  propose:
    "The one LLM call, via 0G Compute, with telemetry and retrieved history in context.",
  verify: "Deterministic projection — Verified, Violation or Escalate.",
  resolve: "Commits autonomously, or freezes for human authorization.",
};

function matchEvent(events: EventRow[], tokens: string[]): EventRow | null {
  for (const event of events) {
    const type = event.type.toLowerCase();
    if (tokens.some((token) => type.includes(token))) return event;
  }
  return null;
}

export function parseCitedHistory(event: EventRow | null): CitedHistory | null {
  if (!event) return null;
  const raw = event.message ?? "";
  if (!raw) return null;

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const value = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(value)
        ? value
        : Array.isArray((value as { entries?: unknown }).entries)
          ? ((value as { entries: unknown[] }).entries as unknown[])
          : null;
      if (list) {
        const entries = list.filter(isHistoryEntry);
        return { entries, raw: trimmed, parsed: true, ts: event.ts };
      }
    } catch {
      // fall through to the plain-text rendering below
    }
  }

  return { entries: [], raw: trimmed, parsed: false, ts: event.ts };
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.nodeId === "string" || typeof v.node_id === "string";
}

const IN_FLIGHT_GATE = new Set(["authorized", "resolved", "committing"]);
const ACTIVITY_TTL_MS = 120_000;

export function nodeActivity(state: MeshState, nodeId: string): string | null {
  const now = Date.now();
  const proposal = state.proposals.find((p) => p.node_id === nodeId) ?? null;
  const fresh = proposal !== null && now - proposal.ts < ACTIVITY_TTL_MS;

  if (proposal && fresh) {
    const commit = state.commits[proposal.id] ?? null;
    const gate =
      state.gates.find((g) => g.proposal_id === proposal.id) ?? null;
    if (!commit && gate && IN_FLIGHT_GATE.has(gate.status)) return "Committing";
    if (!commit && !gate) return "Applying";
  }

  const signal =
    state.events.find(
      (e) =>
        e.node_id === nodeId &&
        ["anomaly", "detect"].some((token) =>
          e.type.toLowerCase().includes(token)
        )
    ) ?? null;

  const recovered = state.nodes[nodeId]?.status === "healthy";

  if (
    signal &&
    !recovered &&
    now - signal.ts < ACTIVITY_TTL_MS &&
    (!proposal || signal.ts > proposal.ts)
  ) {
    return "Diagnosing";
  }
  return null;
}

export function deriveCycle(state: MeshState): TraceCycle {
  const proposal = state.proposals[0] ?? null;
  const verdict = proposal ? (state.verdicts[proposal.id] ?? null) : null;
  const commit = proposal ? (state.commits[proposal.id] ?? null) : null;
  const gate = proposal
    ? (state.gates.find((g) => g.proposal_id === proposal.id) ?? null)
    : null;

  const nodeId = proposal?.node_id ?? null;
  const scoped = nodeId
    ? state.events.filter((e) => e.node_id === nodeId || e.node_id === null)
    : state.events;

  const telemetryEvent = matchEvent(scoped, ["telemetry"]);
  const detectEvent = matchEvent(scoped, ["anomaly", "detect"]);
  const historyEvent = matchEvent(scoped, ["history"]);
  const cited = parseCitedHistory(historyEvent);

  const steps: TraceStep[] = [];

  steps.push({
    key: "telemetry",
    label: STEP_LABELS.telemetry,
    state: telemetryEvent ? "done" : state.hydrated ? "active" : "idle",
    headline: telemetryEvent?.message ?? null,
    ts: telemetryEvent?.ts ?? null,
  });

  steps.push({
    key: "detect",
    label: STEP_LABELS.detect,
    state: detectEvent ? "done" : "idle",
    headline: detectEvent?.message ?? null,
    ts: detectEvent?.ts ?? null,
  });

  steps.push({
    key: "history",
    label: STEP_LABELS.history,
    state: cited ? "done" : detectEvent ? "active" : "idle",
    headline: cited
      ? cited.parsed
        ? `${cited.entries.length} prior record${cited.entries.length === 1 ? "" : "s"} retrieved from the subgraph`
        : cited.raw
      : null,
    ts: cited?.ts ?? null,
  });

  steps.push({
    key: "propose",
    label: STEP_LABELS.propose,
    state: proposal ? "done" : cited ? "active" : "idle",
    headline: proposal
      ? `${proposal.proposed_action ?? "—"} → ${(proposal.target_nodes ?? []).join(", ") || "—"}`
      : null,
    ts: proposal?.ts ?? null,
  });

  steps.push({
    key: "verify",
    label: STEP_LABELS.verify,
    state: verdict
      ? verdict.verdict === "VERIFIED"
        ? "done"
        : "failed"
      : proposal
        ? "active"
        : "idle",
    headline: verdict ? verdict.detail || verdict.verdict : null,
    ts: verdict?.ts ?? null,
  });

  const authorized = Boolean(gate && IN_FLIGHT_GATE.has(gate.status));

  const resolveState: StepState = commit
    ? "done"
    : gate
      ? gate.status === "pending"
        ? "blocked"
        : authorized
          ? "active"
          : "done"
      : verdict
        ? "active"
        : "idle";

  steps.push({
    key: "resolve",
    label: STEP_LABELS.resolve,
    state: resolveState,
    headline: commit
      ? `committed ${commit.applied_action ?? ""}`.trim()
      : gate
        ? gate.status === "pending"
          ? `frozen — ${gate.required_tier} needs ${gate.required_quorum} distinct human${gate.required_quorum === 1 ? "" : "s"}`
          : authorized
            ? `human authorized — resolving the override on-chain and committing ${gate.chosen_action ?? "the action"}…`
            : `gate ${gate.status} — no action was committed`
        : verdict
          ? "Applying the decision…"
          : null,
    ts: commit?.ts ?? (authorized ? null : (gate?.ts ?? null)),
  });

  const latestSignal = matchEvent(state.events, ["anomaly", "detect"]);
  const signalNode = latestSignal?.node_id
    ? state.nodes[latestSignal.node_id]
    : undefined;
  const reasoning = Boolean(
    latestSignal &&
      Date.now() - latestSignal.ts < ACTIVITY_TTL_MS &&
      signalNode?.status !== "healthy" &&
      (!proposal || latestSignal.ts > proposal.ts)
  );

  if (reasoning && latestSignal) {
    const patch = (
      key: StepKey,
      next: StepState,
      headline: string | null,
      ts: number | null
    ) => {
      const step = steps.find((s) => s.key === key);
      if (!step) return;
      step.state = next;
      step.headline = headline;
      step.ts = ts;
    };

    patch("detect", "done", latestSignal.message ?? null, latestSignal.ts);

    const historyFresh = Boolean(cited && cited.ts >= latestSignal.ts);
    if (!historyFresh) {
      patch(
        "history",
        "active",
        "Querying the subgraph for this node's prior incidents…",
        null
      );
    }

    patch(
      "propose",
      "active",
      "Handing off to the agent — one attested inference via 0G Compute, which takes a few seconds.",
      null
    );
    patch("verify", "idle", null, null);
    patch("resolve", "idle", null, null);
  }

  for (const step of steps) {
    if (!step.headline) step.headline = IDLE_HINTS[step.key];
  }

  const pending: TraceCycle["pending"] = reasoning
    ? {
        kind: "reasoning",
        label: `Agent is diagnosing ${latestSignal?.node_id ?? "the mesh"} — attested inference via 0G Compute`,
      }
    : authorized && !commit
      ? {
          kind: "committing",
          label: `Human authorized — resolving the override on-chain and committing ${gate?.chosen_action ?? "the action"}`,
        }
      : null;

  return { proposal, verdict, commit, gate, steps, cited, nodeId, pending };
}
