import blueprint from "./genio_blueprint.json";

export interface Thermal {
  a: number;
  b: number;
  c: number;
  T_ambient: number;
}

interface ThermalNode {
  id: string;
  T_warn: number;
  T_max: number;
  L_max: number;
  X_nominal: number;
  thermal: Thermal;
}

const params = new Map<string, ThermalNode>(
  (blueprint as unknown as { nodes: ThermalNode[] }).nodes.map((n) => [n.id, n])
);

export function thermalFor(nodeId: string): Thermal | undefined {
  return params.get(nodeId)?.thermal;
}

export function equilibriumTemp(
  nodeId: string,
  load: number,
  power: number
): number | undefined {
  const thermal = thermalFor(nodeId);
  if (!thermal || thermal.c <= 0) return undefined;
  return thermal.T_ambient + (thermal.a * load + thermal.b * power) / thermal.c;
}

export function powerForEquilibrium(
  nodeId: string,
  load: number,
  targetTemp: number
): number | undefined {
  const thermal = thermalFor(nodeId);
  if (!thermal || thermal.b <= 0) return undefined;
  return (
    (thermal.c * (targetTemp - thermal.T_ambient) - thermal.a * load) /
    thermal.b
  );
}
