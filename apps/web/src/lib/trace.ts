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

export interface TraceCycle {
  proposal: ProposalRow | null;
  verdict: VerdictRow | null;
  commit: CommitRow | null;
  gate: GateRow | null;
  steps: TraceStep[];
  cited: CitedHistory | null;
  nodeId: string | null;
}

const STEP_LABELS: Record<StepKey, string> = {
  telemetry: "telemetry",
  detect: "detect anomaly",
  history: "get_history",
  propose: "diagnose + propose",
  verify: "verify_constraints",
  resolve: "commit / freeze",
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
    headline: telemetryEvent?.message ?? "awaiting the next telemetry window",
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

  const resolveState: StepState = commit
    ? "done"
    : gate
      ? gate.status === "pending"
        ? "blocked"
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
          : `override resolved — ${gate.chosen_action ?? "—"}`
        : null,
    ts: commit?.ts ?? gate?.ts ?? null,
  });

  return { proposal, verdict, commit, gate, steps, cited, nodeId };
}
