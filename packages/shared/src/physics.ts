import type { GridState, GridNode, NodeStatus } from "./types";
import blueprint from "./genio_blueprint.json";

const NON_PARTICIPATING: NodeStatus[] = ["offline", "isolated"];

function isParticipating(status: NodeStatus): boolean {
  return !NON_PARTICIPATING.includes(status);
}

export interface StepControls {
  noise?: number;
  dt?: number;
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

const nodeParams = new Map<string, BlueprintNode>(
  (blueprint as { nodes: BlueprintNode[] }).nodes.map((n) => [n.id, n])
);

export const THROTTLE_FLOOR = 0.3;
export const THROTTLE_SLOPE = 0.03;

export function throttleFactor(temp: number, tWarn: number): number {
  if (temp <= tWarn) return 1;
  return Math.max(THROTTLE_FLOOR, 1 - (temp - tWarn) * THROTTLE_SLOPE);
}

export function step(state: GridState, controls: StepControls = {}): GridState {
  const dt = controls.dt ?? 1;
  const nodes: GridNode[] = state.nodes.map((n) => {
    const p = nodeParams.get(n.id);
    if (!p || !isParticipating(n.status)) return n;
    const m = n.metrics;
    const heating = p.thermal.a * m.load + p.thermal.b * m.power;
    const cooling = p.thermal.c * (m.temp - p.thermal.T_ambient);
    const temp = m.temp + dt * (heating - cooling);
    const throughput = p.X_nominal * m.load * throttleFactor(temp, p.T_warn);
    const fanRpm = 1000 + Math.max(0, temp - p.thermal.T_ambient) * 40;
    return {
      ...n,
      metrics: { ...m, ts: m.ts + dt, temp, throughput, fanRpm },
    };
  });
  return { ...state, nodes };
}
