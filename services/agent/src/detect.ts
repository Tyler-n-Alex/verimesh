import {
  boundsFor,
  throughputFloor,
  type GridState,
  type HistoryEntry,
} from "@verimesh/shared";

export type DetectionResult =
  | { kind: "NO_OP" }
  | { kind: "anomaly"; nodeId: string; operator: string; reason: string };

const TEMP_THRESHOLD = 85;

export function detectAnomaly(state: GridState): DetectionResult {
  for (const node of state.nodes) {
    if (node.status === "offline" || node.status === "isolated") continue;

    const bounds = boundsFor(node.id);
    if (!bounds) continue;

    if (node.metrics.temp <= TEMP_THRESHOLD) continue;

    const floor = throughputFloor(bounds, node.metrics.load);
    if (node.metrics.throughput >= floor) continue;

    return {
      kind: "anomaly",
      nodeId: node.id,
      operator: node.operator,
      reason: `${node.id} temp ${node.metrics.temp.toFixed(1)}°C with throughput ${node.metrics.throughput.toFixed(0)} below safe floor ${floor.toFixed(0)}`,
    };
  }

  return { kind: "NO_OP" };
}

export interface Observation {
  observation_id: string;
  telemetry_window: Record<string, unknown>[];
  topology: { nodes: GridState["nodes"]; edges: GridState["edges"] };
  history_window: HistoryEntry[];
}

export function buildObservation(
  observationId: string,
  state: GridState,
  telemetry: Record<string, unknown>[],
  history: HistoryEntry[]
): Observation {
  return {
    observation_id: observationId,
    telemetry_window: telemetry,
    topology: { nodes: state.nodes, edges: state.edges },
    history_window: history,
  };
}
