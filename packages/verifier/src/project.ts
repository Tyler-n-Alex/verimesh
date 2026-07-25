import {
  blueprint,
  step,
  type Edge,
  type GridNode,
  type GridState,
  type NodeMetrics,
  type Proposal,
} from "@verimesh/shared";

export const HORIZON_STEPS = 30;
export const HORIZON_DT = 1;
export const THROTTLE_LOAD_FACTOR = 0.6;
export const SCALE_UP_LOAD_FACTOR = 0.7;
export const SCALE_UP_POWER_FACTOR = 1.1;

export const ACTIONS_REQUIRING_TARGET = [
  "REBALANCE_LOAD",
  "THROTTLE_NODE",
  "ISOLATE_NODE",
  "SCALE_UP",
];

export interface Projection {
  projectable: boolean;
  reason: string;
  applied: GridState;
  trajectory: GridState[];
  final: Record<string, NodeMetrics>;
  peak: Record<string, NodeMetrics>;
  offline: string[];
}

const edges = (blueprint as { edges: Edge[] }).edges;

const neighbourWeights = new Map<string, Map<string, number>>();

for (const edge of edges) {
  if (!neighbourWeights.has(edge.from)) {
    neighbourWeights.set(edge.from, new Map());
  }
  if (!neighbourWeights.has(edge.to)) {
    neighbourWeights.set(edge.to, new Map());
  }
  neighbourWeights.get(edge.from)!.set(edge.to, edge.weight);
  neighbourWeights.get(edge.to)!.set(edge.from, edge.weight);
}

export function neighboursOf(nodeId: string): Map<string, number> {
  return neighbourWeights.get(nodeId) ?? new Map();
}

function cloneState(state: GridState): GridState {
  return {
    edges: state.edges.map((e) => ({ ...e })),
    nodes: state.nodes.map((n) => ({ ...n, metrics: { ...n.metrics } })),
  };
}

function liveNeighbours(
  state: GridState,
  nodeId: string
): { node: GridNode; weight: number }[] {
  const weights = neighboursOf(nodeId);
  const out: { node: GridNode; weight: number }[] = [];
  for (const node of state.nodes) {
    const weight = weights.get(node.id);
    if (weight === undefined) continue;
    if (node.status === "offline") continue;
    out.push({ node, weight });
  }
  return out.sort((a, b) => a.node.id.localeCompare(b.node.id));
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function applyThrottle(node: GridNode): void {
  node.metrics.load = node.metrics.load * THROTTLE_LOAD_FACTOR;
}

function applyScaleUp(node: GridNode): void {
  node.metrics.load = node.metrics.load * SCALE_UP_LOAD_FACTOR;
  node.metrics.power = node.metrics.power * SCALE_UP_POWER_FACTOR;
}

function applyIsolate(state: GridState, node: GridNode): void {
  const shed = node.metrics.load;
  const receivers = liveNeighbours(state, node.id).filter(
    (n) => n.node.id !== node.id
  );
  const totalWeight = receivers.reduce((sum, r) => sum + r.weight, 0);

  node.status = "offline";
  node.metrics.load = 0;
  node.metrics.throughput = 0;
  node.metrics.power = 0;

  if (totalWeight <= 0) return;

  for (const receiver of receivers) {
    receiver.node.metrics.load += (shed * receiver.weight) / totalWeight;
  }
}

function applyRebalance(state: GridState, node: GridNode): void {
  const pool = [node, ...liveNeighbours(state, node.id).map((n) => n.node)];
  const unique = pool.filter(
    (candidate, index) => pool.findIndex((p) => p.id === candidate.id) === index
  );
  if (unique.length === 0) return;
  const mean =
    unique.reduce((sum, n) => sum + n.metrics.load, 0) / unique.length;
  for (const member of unique) {
    member.metrics.load = mean;
  }
}

export function applyAction(
  state: GridState,
  proposal: Proposal
): { state: GridState; projectable: boolean; reason: string } {
  const next = cloneState(state);
  const byId = new Map(next.nodes.map((n) => [n.id, n]));
  const targets = dedupe(proposal.target_nodes);

  if (proposal.proposed_action === "ESCALATE_TO_HUMAN") {
    return {
      state: next,
      projectable: false,
      reason: "the proposal is itself an escalation",
    };
  }

  if (proposal.proposed_action === "NO_OP") {
    return { state: next, projectable: true, reason: "no action projected" };
  }

  if (
    ACTIONS_REQUIRING_TARGET.includes(proposal.proposed_action) &&
    targets.length === 0
  ) {
    return {
      state: next,
      projectable: false,
      reason: `${proposal.proposed_action} names no target node`,
    };
  }

  for (const targetId of targets) {
    const node = byId.get(targetId);
    if (!node) {
      return {
        state: next,
        projectable: false,
        reason: `unknown target node ${targetId}`,
      };
    }
    if (node.status === "offline") {
      return {
        state: next,
        projectable: false,
        reason: `target node ${targetId} is already offline`,
      };
    }

    switch (proposal.proposed_action) {
      case "THROTTLE_NODE":
        applyThrottle(node);
        break;
      case "SCALE_UP":
        applyScaleUp(node);
        break;
      case "ISOLATE_NODE":
        applyIsolate(next, node);
        break;
      case "REBALANCE_LOAD":
        applyRebalance(next, node);
        break;
      default:
        return {
          state: next,
          projectable: false,
          reason: `unmodelled action ${proposal.proposed_action}`,
        };
    }
  }

  return {
    state: next,
    projectable: true,
    reason: `${proposal.proposed_action} projected over ${targets.length} target(s)`,
  };
}

function envelope(a: NodeMetrics, b: NodeMetrics): NodeMetrics {
  return {
    ts: Math.max(a.ts, b.ts),
    load: Math.max(a.load, b.load),
    temp: Math.max(a.temp, b.temp),
    throughput: Math.min(a.throughput, b.throughput),
    power: Math.max(a.power, b.power),
    mem: Math.max(a.mem, b.mem),
    fanRpm: Math.max(a.fanRpm, b.fanRpm),
  };
}

export function projectFrom(
  applied: GridState,
  steps: number = HORIZON_STEPS
): GridState[] {
  const trajectory: GridState[] = [applied];
  let current = applied;
  for (let i = 0; i < steps; i++) {
    current = step(current, { dt: HORIZON_DT });
    trajectory.push(current);
  }
  return trajectory;
}

export function projectAction(
  state: GridState,
  proposal: Proposal,
  steps: number = HORIZON_STEPS
): Projection {
  const { state: applied, projectable, reason } = applyAction(state, proposal);
  const trajectory = projectable ? projectFrom(applied, steps) : [applied];
  const last = trajectory[trajectory.length - 1];

  const final: Record<string, NodeMetrics> = {};
  const peak: Record<string, NodeMetrics> = {};

  for (const node of last.nodes) {
    final[node.id] = { ...node.metrics };
  }

  for (const frame of trajectory) {
    for (const node of frame.nodes) {
      const current = peak[node.id];
      peak[node.id] = current
        ? envelope(current, node.metrics)
        : { ...node.metrics };
    }
  }

  return {
    projectable,
    reason,
    applied,
    trajectory,
    final,
    peak,
    offline: last.nodes.filter((n) => n.status === "offline").map((n) => n.id),
  };
}
