import {
  detectAnomaly as detectAnomalyIn,
  type DetectionResult,
  type DeviceRule,
} from "@verimesh/verifier";
import type { GridState, HistoryEntry } from "@verimesh/shared";

export type { DetectionResult, DeviceRule };

export function deviceRuleFromEnv(): DeviceRule {
  return {
    nodeId: process.env.NEXT_PUBLIC_DEVICE_NODE_ID ?? "device-s22",
    loadCeiling: Number(process.env.DEVICE_L_MAX ?? 0.28),
    enabled: process.env.DEVICE_CONTENTION_DETECTION === "true",
  };
}

export function detectAnomaly(state: GridState): DetectionResult {
  return detectAnomalyIn(state, deviceRuleFromEnv());
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
