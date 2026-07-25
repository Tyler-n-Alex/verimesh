import blueprint from "./genio_blueprint.json";
import { THROTTLE_FLOOR, THROTTLE_SLOPE } from "./physics";
import type { GridState, NodeMetrics, NodeStatus, Violation } from "./types";

export const NON_PARTICIPATING_STATUSES: NodeStatus[] = ["offline", "isolated"];

export function isParticipating(status: NodeStatus): boolean {
  return !NON_PARTICIPATING_STATUSES.includes(status);
}

export type InvariantMetric = "temp" | "load" | "power" | "throughput";

export const INVARIANT_METRICS: InvariantMetric[] = [
  "temp",
  "load",
  "power",
  "throughput",
];

export interface PhysicalBounds {
  id: string;
  tempWarn: number;
  tempCeiling: number;
  loadCeiling: number;
  powerCeiling: number;
  throughputFloorRatio: number;
  nominalThroughput: number;
}

type BlueprintThermal = { a: number; b: number; c: number; T_ambient: number };

type BlueprintNode = {
  id: string;
  T_warn: number;
  T_max: number;
  L_max: number;
  X_nominal: number;
  thermal: BlueprintThermal;
};

function derive(n: BlueprintNode): PhysicalBounds {
  return {
    id: n.id,
    tempWarn: n.T_warn,
    tempCeiling: n.T_max,
    loadCeiling: n.L_max,
    powerCeiling: (n.thermal.c * (n.T_max - n.thermal.T_ambient)) / n.thermal.b,
    throughputFloorRatio: Math.max(
      THROTTLE_FLOOR,
      1 - (n.T_max - n.T_warn) * THROTTLE_SLOPE
    ),
    nominalThroughput: n.X_nominal,
  };
}

export const BOUNDS: ReadonlyMap<string, PhysicalBounds> = new Map(
  (blueprint as { nodes: BlueprintNode[] }).nodes.map((n) => [n.id, derive(n)])
);

export function boundsFor(nodeId: string): PhysicalBounds | undefined {
  return BOUNDS.get(nodeId);
}

export function throughputFloor(bounds: PhysicalBounds, load: number): number {
  return (
    bounds.nominalThroughput * Math.max(0, load) * bounds.throughputFloorRatio
  );
}

export function unverifiableReason(
  nodeId: string,
  metrics: NodeMetrics
): string | undefined {
  if (!BOUNDS.has(nodeId)) {
    return `${nodeId} has no bounds in genio_blueprint.json`;
  }
  const bad: string[] = [];
  for (const metric of INVARIANT_METRICS) {
    const value = metrics[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      bad.push(`${metric} is ${String(value)}`);
    }
  }
  if (bad.length === 0) return undefined;
  return `${nodeId} ${bad.join(", ")}`;
}

export function unverifiableNodes(state: GridState): string[] {
  return state.nodes
    .filter(
      (node) =>
        isParticipating(node.status) &&
        unverifiableReason(node.id, node.metrics) !== undefined
    )
    .map((node) => node.id);
}

export function checkMetrics(
  nodeId: string,
  metrics: NodeMetrics
): Violation[] {
  const bounds = BOUNDS.get(nodeId);
  if (!bounds) return [];

  const out: Violation[] = [];

  if (metrics.temp > bounds.tempCeiling) {
    out.push({
      node: nodeId,
      metric: "temp",
      value: metrics.temp,
      bound: bounds.tempCeiling,
    });
  }
  if (metrics.load > bounds.loadCeiling) {
    out.push({
      node: nodeId,
      metric: "load",
      value: metrics.load,
      bound: bounds.loadCeiling,
    });
  }
  if (metrics.power > bounds.powerCeiling) {
    out.push({
      node: nodeId,
      metric: "power",
      value: metrics.power,
      bound: bounds.powerCeiling,
    });
  }

  const floor = throughputFloor(bounds, metrics.load);
  if (metrics.throughput < floor) {
    out.push({
      node: nodeId,
      metric: "throughput",
      value: metrics.throughput,
      bound: floor,
    });
  }

  return out;
}

export function checkState(state: GridState): Violation[] {
  const out: Violation[] = [];
  for (const node of state.nodes) {
    if (!isParticipating(node.status)) continue;
    out.push(...checkMetrics(node.id, node.metrics));
  }
  return out;
}

export function isFloorMetric(metric: string): boolean {
  return metric === "throughput";
}

export function excess(violation: Violation): number {
  const { value, bound } = violation;
  if (isFloorMetric(violation.metric)) {
    if (bound <= 0) return 0;
    return (bound - value) / bound;
  }
  if (bound <= 0) return value > 0 ? Infinity : 0;
  return (value - bound) / bound;
}

export const METRIC_PRIORITY: Record<string, number> = {
  load: 0,
  temp: 1,
  power: 2,
  throughput: 3,
};

export function principalViolation(
  violations: Violation[]
): Violation | undefined {
  const ranked = violations.slice().sort((a, b) => {
    const priority =
      (METRIC_PRIORITY[a.metric] ?? 99) - (METRIC_PRIORITY[b.metric] ?? 99);
    if (priority !== 0) return priority;
    return excess(b) - excess(a);
  });
  return ranked[0];
}

export function worstViolation(violations: Violation[]): Violation | undefined {
  let worst: Violation | undefined;
  let worstExcess = -Infinity;
  for (const v of violations) {
    const e = excess(v);
    if (e > worstExcess) {
      worst = v;
      worstExcess = e;
    }
  }
  return worst;
}

export function describeViolation(violation: Violation): string {
  const unit =
    violation.metric === "temp"
      ? "°C"
      : violation.metric === "power"
        ? "W"
        : violation.metric === "throughput"
          ? "ops/s"
          : "";
  const comparator = isFloorMetric(violation.metric) ? "floor" : "limit";
  return `${violation.node} ${violation.metric} ${violation.value.toFixed(2)}${unit} vs ${comparator} ${violation.bound.toFixed(2)}${unit}`;
}
