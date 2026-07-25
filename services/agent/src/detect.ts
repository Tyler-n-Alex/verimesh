import {
  boundsFor,
  throughputFloor,
  type GridState,
  type HistoryEntry,
} from "@verimesh/shared";
import { equilibriumTemp } from "./thermal";

export type DetectionResult =
  | { kind: "NO_OP" }
  | { kind: "anomaly"; nodeId: string; operator: string; reason: string };

export function detectAnomaly(state: GridState): DetectionResult {
  for (const node of state.nodes) {
    if (
      node.status === "offline" ||
      node.status === "isolated" ||
      node.status === "awaiting_human"
    ) {
      continue;
    }

    const bounds = boundsFor(node.id);
    if (!bounds) continue;

    const { temp, load, throughput, power } = node.metrics;
    if (temp <= bounds.tempWarn) continue;

    const floor = throughputFloor(bounds, load);
    const equilibrium = equilibriumTemp(node.id, load, power);

    if (temp > bounds.tempCeiling && throughput < floor) {
      return {
        kind: "anomaly",
        nodeId: node.id,
        operator: node.operator,
        reason: `${node.id} temp ${temp.toFixed(1)}°C is over its ${bounds.tempCeiling}°C ceiling with throughput ${throughput.toFixed(0)} below safe floor ${floor.toFixed(0)}`,
      };
    }

    if (equilibrium !== undefined && equilibrium > bounds.tempCeiling) {
      return {
        kind: "anomaly",
        nodeId: node.id,
        operator: node.operator,
        reason: `${node.id} temp ${temp.toFixed(1)}°C is past its ${bounds.tempWarn}°C warn line and settles at ${equilibrium.toFixed(1)}°C at load ${load.toFixed(2)} / ${power.toFixed(0)}W — over its ${bounds.tempCeiling}°C ceiling if nothing changes`,
      };
    }
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
