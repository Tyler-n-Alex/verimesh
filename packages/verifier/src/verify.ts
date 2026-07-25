import {
  checkMetrics,
  describeViolation,
  excess,
  principalViolation,
  unverifiableReason,
  type GridState,
  type NodeMetrics,
  type Proposal,
  type VerdictResult,
  type Violation,
} from "@verimesh/shared";
import { HORIZON_STEPS, projectAction, type Projection } from "./project";

export const MATERIAL_LOAD_DELTA = 0.005;
export const MATERIAL_TEMP_DELTA = 0.25;
export const MATERIAL_POWER_DELTA = 1;
export const WORSE_THAN_BASELINE_EPSILON = 1e-9;

export const NO_OP_PROPOSAL: Proposal = {
  diagnosis: "counterfactual baseline",
  proposed_action: "NO_OP",
  target_nodes: [],
  expected_effect: "the grid is left to evolve on its own",
  confidence: 1,
  risk_flags: [],
};

export interface BlastRadius {
  nodes: string[];
  operators: string[];
}

export interface DetailedVerdictResult extends VerdictResult {
  violations: Violation[];
  preExisting: Violation[];
  peak: Record<string, NodeMetrics>;
  baseline: Record<string, NodeMetrics>;
  baselinePeak: Record<string, NodeMetrics>;
  dormant: string[];
  baselineDormant: string[];
  unverifiable: string[];
  blast: BlastRadius;
  horizon: number;
}

function violationsIn(
  peak: Record<string, NodeMetrics>,
  dormant: string[]
): Violation[] {
  const skip = new Set(dormant);
  const out: Violation[] = [];
  for (const [nodeId, metrics] of Object.entries(peak)) {
    if (skip.has(nodeId)) continue;
    out.push(...checkMetrics(nodeId, metrics));
  }
  return out.sort(
    (a, b) => a.node.localeCompare(b.node) || a.metric.localeCompare(b.metric)
  );
}

function unverifiableIn(
  peak: Record<string, NodeMetrics>,
  dormant: string[]
): string[] {
  const skip = new Set(dormant);
  const out: string[] = [];
  for (const [nodeId, metrics] of Object.entries(peak)) {
    if (skip.has(nodeId)) continue;
    const reason = unverifiableReason(nodeId, metrics);
    if (reason) out.push(reason);
  }
  return out.sort();
}

function splitViolations(
  violations: Violation[],
  baseline: Violation[]
): { attributable: Violation[]; preExisting: Violation[] } {
  const attributable: Violation[] = [];
  const preExisting: Violation[] = [];

  for (const violation of violations) {
    const match = baseline.find(
      (b) => b.node === violation.node && b.metric === violation.metric
    );
    if (!match) {
      attributable.push(violation);
      continue;
    }
    if (excess(violation) > excess(match) + WORSE_THAN_BASELINE_EPSILON) {
      attributable.push(violation);
      continue;
    }
    preExisting.push(violation);
  }

  return { attributable, preExisting };
}

function materiallyChanged(
  action: NodeMetrics | undefined,
  baseline: NodeMetrics | undefined
): boolean {
  if (!action || !baseline) return true;
  if (Math.abs(action.load - baseline.load) > MATERIAL_LOAD_DELTA) return true;
  if (Math.abs(action.temp - baseline.temp) > MATERIAL_TEMP_DELTA) return true;
  if (Math.abs(action.power - baseline.power) > MATERIAL_POWER_DELTA) {
    return true;
  }
  return false;
}

export function computeBlastRadius(
  state: GridState,
  projection: Projection,
  baseline: Projection
): BlastRadius {
  const operatorOf = new Map(state.nodes.map((n) => [n.id, n.operator]));
  const baselineDormant = new Set(baseline.dormant);
  const nodes = new Set<string>();

  for (const nodeId of Object.keys(projection.peak)) {
    const changed = materiallyChanged(
      projection.peak[nodeId],
      baseline.peak[nodeId]
    );
    const wentDormant =
      projection.dormant.includes(nodeId) && !baselineDormant.has(nodeId);
    if (changed || wentDormant) nodes.add(nodeId);
  }

  const sortedNodes = Array.from(nodes).sort();
  const operators = Array.from(
    new Set(
      sortedNodes
        .map((nodeId) => operatorOf.get(nodeId))
        .filter((operator): operator is string => Boolean(operator))
    )
  ).sort();

  return { nodes: sortedNodes, operators };
}

function detailFor(
  verdict: VerdictResult["verdict"],
  proposal: Proposal,
  projection: Projection,
  attributable: Violation[],
  preExisting: Violation[],
  blast: BlastRadius,
  horizon: number
): string {
  if (verdict === "VIOLATION_TRIGGERED") {
    const worst = principalViolation(attributable);
    const others =
      attributable.length > 1 ? ` (+${attributable.length - 1} more)` : "";
    return `${proposal.proposed_action} on ${proposal.target_nodes.join(", ") || "no target"} breaches ${worst ? describeViolation(worst) : "an invariant"} within ${horizon} steps${others}; blast radius ${blast.nodes.length} node(s) across ${blast.operators.join(", ") || "no operator"}`;
  }

  if (verdict === "ESCALATE") {
    if (!projection.projectable) {
      return `${proposal.proposed_action} cannot be projected: ${projection.reason}`;
    }
    const worst = principalViolation(preExisting);
    return `${proposal.proposed_action} leaves an existing breach unresolved: ${worst ? describeViolation(worst) : "unknown"}`;
  }

  return `${proposal.proposed_action} holds every physical invariant for ${horizon} steps; blast radius ${blast.nodes.length} node(s) across ${blast.operators.join(", ") || "no operator"}`;
}

export function verifyConstraints(
  state: GridState,
  proposal: Proposal,
  horizon: number = HORIZON_STEPS
): DetailedVerdictResult {
  const baseline = projectAction(state, NO_OP_PROPOSAL, horizon);
  const projection = projectAction(state, proposal, horizon);

  const baselineViolations = violationsIn(baseline.peak, baseline.dormant);

  if (!projection.projectable) {
    const targeted = state.nodes.filter((n) =>
      proposal.target_nodes.includes(n.id)
    );
    return {
      verdict: "ESCALATE",
      detail: `${proposal.proposed_action} cannot be projected: ${projection.reason}`,
      projected: baseline.final,
      violations: [],
      preExisting: baselineViolations,
      peak: baseline.peak,
      baseline: baseline.final,
      baselinePeak: baseline.peak,
      dormant: baseline.dormant,
      baselineDormant: baseline.dormant,
      unverifiable: unverifiableIn(baseline.peak, baseline.dormant),
      blast: {
        nodes: targeted.map((n) => n.id).sort(),
        operators: Array.from(new Set(targeted.map((n) => n.operator))).sort(),
      },
      horizon,
    };
  }

  const unverifiable = unverifiableIn(projection.peak, projection.dormant);
  const blastOfProjection = computeBlastRadius(state, projection, baseline);

  if (unverifiable.length > 0) {
    return {
      verdict: "ESCALATE",
      detail: `${proposal.proposed_action} cannot be verified — the projection contains metrics no invariant applies to: ${unverifiable.join("; ")}`,
      projected: projection.final,
      violations: [],
      preExisting: baselineViolations,
      peak: projection.peak,
      baseline: baseline.final,
      baselinePeak: baseline.peak,
      dormant: projection.dormant,
      baselineDormant: baseline.dormant,
      unverifiable,
      blast: blastOfProjection,
      horizon,
    };
  }

  const violations = violationsIn(projection.peak, projection.dormant);
  const { attributable, preExisting } = splitViolations(
    violations,
    baselineViolations
  );
  const blast = blastOfProjection;

  const verdict: VerdictResult["verdict"] =
    attributable.length > 0
      ? "VIOLATION_TRIGGERED"
      : preExisting.length > 0
        ? "ESCALATE"
        : "VERIFIED";

  const violated =
    verdict === "VIOLATION_TRIGGERED"
      ? principalViolation(attributable)
      : verdict === "ESCALATE"
        ? principalViolation(preExisting)
        : undefined;

  return {
    verdict,
    detail: detailFor(
      verdict,
      proposal,
      projection,
      attributable,
      preExisting,
      blast,
      horizon
    ),
    violated,
    projected: projection.final,
    violations: attributable,
    preExisting,
    peak: projection.peak,
    baseline: baseline.final,
    baselinePeak: baseline.peak,
    dormant: projection.dormant,
    baselineDormant: baseline.dormant,
    unverifiable,
    blast,
    horizon,
  };
}

export function affectedOperators(result: DetailedVerdictResult): string[] {
  return result.blast.operators;
}

export function affectedNodes(result: DetailedVerdictResult): string[] {
  return result.blast.nodes;
}
