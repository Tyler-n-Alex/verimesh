import {
  boundsFor,
  powerForEquilibrium,
  equilibriumTemp,
  isParticipating,
  thermalFor,
  throttleFactor,
  throughputFloor,
  type GridState,
  type NodeMetrics,
} from "@verimesh/shared";

export interface FaultSignature {
  nodeId: string;
  operator: string;
  temp: number;
  load: number;
  power: number;
  throughput: number;
  tempWarn: number;
  tempCeiling: number;
  equilibrium?: number;
  nominalAtLoad: number;
  safeFloor: number;
  overWarn: boolean;
  overCeiling: boolean;
  headedOverCeiling: boolean;
  degradedThroughput: boolean;
  starvedThroughput: boolean;
  offlineNeighbours: string[];
  severity: number;
}

export function neighbourIdsOf(state: GridState, nodeId: string): string[] {
  const out = new Set<string>();
  for (const edge of state.edges) {
    if (edge.from === nodeId) out.add(edge.to);
    if (edge.to === nodeId) out.add(edge.from);
  }
  return Array.from(out).sort();
}

export function offlineNeighboursOf(
  state: GridState,
  nodeId: string
): string[] {
  const neighbours = new Set(neighbourIdsOf(state, nodeId));
  return state.nodes
    .filter((node) => neighbours.has(node.id) && !isParticipating(node.status))
    .map((node) => node.id)
    .sort();
}

export function readSignature(
  state: GridState,
  nodeId: string
): FaultSignature | undefined {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;

  const bounds = boundsFor(nodeId);
  if (!bounds) return undefined;

  const { temp, load, power, throughput } = node.metrics;
  const equilibrium = equilibriumTemp(nodeId, load, power);
  const nominalAtLoad = bounds.nominalThroughput * Math.max(0, load);
  const safeFloor = throughputFloor(bounds, load);

  const overCeiling = temp > bounds.tempCeiling;
  const headedOverCeiling =
    equilibrium !== undefined && equilibrium > bounds.tempCeiling;

  return {
    nodeId,
    operator: node.operator,
    temp,
    load,
    power,
    throughput,
    tempWarn: bounds.tempWarn,
    tempCeiling: bounds.tempCeiling,
    equilibrium,
    nominalAtLoad,
    safeFloor,
    overWarn: temp > bounds.tempWarn,
    overCeiling,
    headedOverCeiling,
    degradedThroughput: throughput < nominalAtLoad,
    starvedThroughput: throughput < safeFloor,
    offlineNeighbours: offlineNeighboursOf(state, nodeId),
    severity: Math.max(
      temp - bounds.tempCeiling,
      (equilibrium ?? -Infinity) - bounds.tempCeiling
    ),
  };
}

export function consistentMetrics(
  nodeId: string,
  metrics: NodeMetrics
): NodeMetrics {
  const bounds = boundsFor(nodeId);
  if (!bounds) return metrics;

  const throughput =
    bounds.nominalThroughput *
    Math.max(0, metrics.load) *
    throttleFactor(metrics.temp, bounds.tempWarn);

  return {
    ...metrics,
    throughput,
    fanRpm:
      1000 +
      Math.max(0, metrics.temp - (thermalFor(nodeId)?.T_ambient ?? 22)) * 40,
  };
}

export const DRIVE_MARGIN_C = 4;
export const START_MARGIN_C = 8;

export interface Injection {
  nodeId: string;
  load: number;
  power: number;
  temp: number;
  equilibrium: number;
}

export function driveFor(
  nodeId: string,
  load: number,
  power: number
): Injection | undefined {
  const bounds = boundsFor(nodeId);
  if (!bounds) return undefined;

  const target = bounds.tempCeiling + DRIVE_MARGIN_C;
  const needed = powerForEquilibrium(nodeId, load, target);
  if (needed === undefined) return undefined;

  const driven = Math.min(
    Math.max(power, Math.ceil(needed)),
    Math.floor(bounds.powerCeiling * 0.9)
  );
  const equilibrium = equilibriumTemp(nodeId, load, driven);
  if (equilibrium === undefined) return undefined;

  return {
    nodeId,
    load,
    power: driven,
    temp: Math.min(bounds.tempWarn + START_MARGIN_C, bounds.tempCeiling - 1),
    equilibrium,
  };
}

export function driveNode(state: GridState, nodeId: string): Injection | undefined {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node || !isParticipating(node.status)) return undefined;

  const injection = driveFor(nodeId, node.metrics.load, node.metrics.power);
  if (!injection) return undefined;

  node.metrics = consistentMetrics(nodeId, {
    ...node.metrics,
    power: injection.power,
    temp: injection.temp,
  });

  return injection;
}
