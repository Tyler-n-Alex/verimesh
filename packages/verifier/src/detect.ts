import { boundsFor, type GridState, type NodeStatus } from "@verimesh/shared";
import { readSignature, type FaultSignature } from "./signature";

export const SKIPPED_STATUSES: NodeStatus[] = [
  "offline",
  "isolated",
  "awaiting_human",
];

export interface DeviceRule {
  nodeId: string;
  loadCeiling: number;
  enabled: boolean;
}

export type DetectionResult =
  | { kind: "NO_OP" }
  | {
      kind: "anomaly";
      nodeId: string;
      operator: string;
      reason: string;
      signature?: FaultSignature;
    };

interface Candidate {
  nodeId: string;
  operator: string;
  reason: string;
  severity: number;
  signature?: FaultSignature;
}

function deviceCandidate(
  state: GridState,
  rule: DeviceRule
): Candidate | undefined {
  const node = state.nodes.find((n) => n.id === rule.nodeId);
  if (!node) return undefined;
  if (SKIPPED_STATUSES.includes(node.status)) return undefined;
  if (node.metrics.load <= rule.loadCeiling) return undefined;

  return {
    nodeId: node.id,
    operator: node.operator,
    severity: node.metrics.load - rule.loadCeiling,
    reason: `${node.id} is oversubscribed — CPU contention ${(node.metrics.load * 100).toFixed(0)}% is over its ${(rule.loadCeiling * 100).toFixed(0)}% ceiling, so work is queueing behind the scheduler`,
  };
}

export function detectAnomaly(
  state: GridState,
  device?: DeviceRule
): DetectionResult {
  const candidates: Candidate[] = [];

  for (const node of state.nodes) {
    if (SKIPPED_STATUSES.includes(node.status)) continue;

    if (device?.enabled && node.id === device.nodeId) {
      const candidate = deviceCandidate(state, device);
      if (candidate) candidates.push(candidate);
      continue;
    }

    const bounds = boundsFor(node.id);
    if (!bounds) continue;

    const signature = readSignature(state, node.id);
    if (!signature || !signature.overWarn) continue;

    if (signature.overCeiling && signature.starvedThroughput) {
      candidates.push({
        nodeId: node.id,
        operator: node.operator,
        severity: signature.severity,
        signature,
        reason: `${node.id} temp ${signature.temp.toFixed(1)}°C is over its ${bounds.tempCeiling}°C ceiling with throughput ${signature.throughput.toFixed(0)} below safe floor ${signature.safeFloor.toFixed(0)}`,
      });
      continue;
    }

    if (signature.headedOverCeiling) {
      candidates.push({
        nodeId: node.id,
        operator: node.operator,
        severity: signature.severity,
        signature,
        reason: `${node.id} temp ${signature.temp.toFixed(1)}°C is past its ${bounds.tempWarn}°C warn line and settles at ${(signature.equilibrium ?? 0).toFixed(1)}°C at load ${signature.load.toFixed(2)} / ${signature.power.toFixed(0)}W — over its ${bounds.tempCeiling}°C ceiling if nothing changes`,
      });
    }
  }

  if (candidates.length === 0) return { kind: "NO_OP" };

  candidates.sort(
    (a, b) => b.severity - a.severity || a.nodeId.localeCompare(b.nodeId)
  );

  const worst = candidates[0];
  return {
    kind: "anomaly",
    nodeId: worst.nodeId,
    operator: worst.operator,
    reason: worst.reason,
    signature: worst.signature,
  };
}

export function detectAnomalies(
  state: GridState,
  device?: DeviceRule
): Extract<DetectionResult, { kind: "anomaly" }>[] {
  const seen = new Set<string>();
  const out: Extract<DetectionResult, { kind: "anomaly" }>[] = [];
  let remaining = state;

  while (true) {
    const found = detectAnomaly(remaining, device);
    if (found.kind !== "anomaly" || seen.has(found.nodeId)) break;
    seen.add(found.nodeId);
    out.push(found);
    remaining = {
      ...remaining,
      nodes: remaining.nodes.filter((node) => !seen.has(node.id)),
    };
  }

  return out;
}
