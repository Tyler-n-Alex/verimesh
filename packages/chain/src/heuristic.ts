import {
  REPEAT_OFFENDER_INCIDENTS,
  boundsFor,
  equilibriumTemp,
  throughputFloor,
  type Edge,
  type GridNode,
  type NodeStatus,
  type ProposalInput,
} from "@verimesh/shared";

const DORMANT: NodeStatus[] = ["offline", "isolated"];

export interface HeuristicObservation {
  telemetry_window?: unknown;
  topology?: unknown;
  history_window?: unknown;
}

interface Topology {
  nodes: GridNode[];
  edges: Edge[];
}

interface TelemetryRow {
  node_id?: string;
  temp?: number;
  load?: number;
  power?: number;
  throughput?: number;
}

interface HistoryRow {
  nodeId?: string;
  action?: string;
  verdict?: string;
}

function topologyOf(observation: HeuristicObservation): Topology {
  const raw = observation.topology as Partial<Topology> | undefined;
  return {
    nodes: Array.isArray(raw?.nodes) ? (raw.nodes as GridNode[]) : [],
    edges: Array.isArray(raw?.edges) ? (raw.edges as Edge[]) : [],
  };
}

function telemetryOf(observation: HeuristicObservation): TelemetryRow[] {
  return Array.isArray(observation.telemetry_window)
    ? (observation.telemetry_window as TelemetryRow[])
    : [];
}

function historyOf(observation: HeuristicObservation): HistoryRow[] {
  return Array.isArray(observation.history_window)
    ? (observation.history_window as HistoryRow[])
    : [];
}

export function focusNodeOf(
  observation: HeuristicObservation
): string | undefined {
  const telemetry = telemetryOf(observation);
  const named = telemetry.find((row) => typeof row.node_id === "string");
  if (named?.node_id) return named.node_id;

  const topology = topologyOf(observation);
  const live = topology.nodes.filter((n) => !DORMANT.includes(n.status));
  if (live.length === 0) return undefined;

  return live
    .slice()
    .sort(
      (a, b) =>
        (b.metrics?.temp ?? -Infinity) - (a.metrics?.temp ?? -Infinity) ||
        a.id.localeCompare(b.id)
    )[0]?.id;
}

function offlineNeighbours(topology: Topology, nodeId: string): string[] {
  const adjacent = new Set<string>();
  for (const edge of topology.edges) {
    if (edge.from === nodeId) adjacent.add(edge.to);
    if (edge.to === nodeId) adjacent.add(edge.from);
  }
  return topology.nodes
    .filter((n) => adjacent.has(n.id) && DORMANT.includes(n.status))
    .map((n) => n.id)
    .sort();
}

export function heuristicProposal(
  observation: HeuristicObservation
): ProposalInput {
  const topology = topologyOf(observation);
  const nodeId = focusNodeOf(observation);

  if (!nodeId) {
    return {
      diagnosis:
        "the observation carries no identifiable node, so there is nothing to act on",
      proposed_action: "NO_OP",
      target_nodes: [],
      expected_effect: "the mesh is left to evolve on its own",
      confidence: 0.5,
      risk_flags: ["no_focus_node"],
    };
  }

  const node = topology.nodes.find((n) => n.id === nodeId);
  const latest = telemetryOf(observation).find(
    (row) => row.node_id === nodeId
  );

  const load = node?.metrics?.load ?? latest?.load ?? 0;
  const temp = node?.metrics?.temp ?? latest?.temp ?? 0;
  const power = node?.metrics?.power ?? latest?.power ?? 0;
  const throughput = node?.metrics?.throughput ?? latest?.throughput ?? 0;

  const bounds = boundsFor(nodeId);
  const equilibrium = equilibriumTemp(nodeId, load, power);
  const lost = offlineNeighbours(topology, nodeId);
  const priors = historyOf(observation).filter(
    (row) => !row.nodeId || row.nodeId === nodeId
  );

  const nominalAtLoad = (bounds?.nominalThroughput ?? 0) * Math.max(0, load);
  const degraded = bounds ? throughput < nominalAtLoad : false;
  const starved = bounds ? throughput < throughputFloor(bounds, load) : false;
  const runaway =
    bounds !== undefined &&
    equilibrium !== undefined &&
    equilibrium > bounds.tempCeiling;

  if (lost.length > 0 && (degraded || starved)) {
    return {
      diagnosis: `${nodeId} is at ${temp.toFixed(1)}°C with throughput ${throughput.toFixed(0)} against ${nominalAtLoad.toFixed(0)} nominal at load ${load.toFixed(2)}, and its neighbour${lost.length === 1 ? "" : "s"} ${lost.join(", ")} ${lost.length === 1 ? "has" : "have"} already dropped out; rising temperature with falling throughput next to a lost neighbour reads as a failure cascade rather than a benign spike`,
      proposed_action: "ISOLATE_NODE",
      target_nodes: [nodeId],
      expected_effect: `remove ${nodeId} from the mesh before it degrades further`,
      confidence: 0.72,
      risk_flags: ["neighbour_offline", "load_redistribution"],
    };
  }

  if (priors.length >= REPEAT_OFFENDER_INCIDENTS) {
    return {
      diagnosis: `${nodeId} is at ${temp.toFixed(1)}°C at load ${load.toFixed(2)}${runaway ? ` and settles at ${equilibrium!.toFixed(1)}°C if nothing changes` : ""}, matching ${priors.length} prior incidents the chain has recorded on this node`,
      proposed_action: "THROTTLE_NODE",
      target_nodes: [nodeId],
      expected_effect: `shed load until ${nodeId} returns to its thermal envelope`,
      confidence: 0.88,
      risk_flags: ["repeat_offender"],
    };
  }

  if (bounds && (runaway || temp > bounds.tempWarn)) {
    return {
      diagnosis: `${nodeId} took a load spike to ${load.toFixed(2)} and is at ${temp.toFixed(1)}°C${runaway ? `, settling at ${equilibrium!.toFixed(1)}°C over its ${bounds.tempCeiling}°C ceiling` : ""}, with no neighbour loss to suggest a cascade`,
      proposed_action: "THROTTLE_NODE",
      target_nodes: [nodeId],
      expected_effect: `load sheds and ${nodeId} cools back inside its envelope`,
      confidence: 0.91,
      risk_flags: [],
    };
  }

  return {
    diagnosis: `${nodeId} is inside every bound the blueprint sets for it`,
    proposed_action: "NO_OP",
    target_nodes: [],
    expected_effect: "the mesh is left to evolve on its own",
    confidence: 0.6,
    risk_flags: [],
  };
}
