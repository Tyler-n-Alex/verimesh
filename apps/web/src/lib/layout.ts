import type { MeshNode } from "@/lib/db";

export const SPACING = 1.75;
export const NODE_RADIUS = 0.34;
export const TILE = 1.55;

export function worldPos(node: MeshNode): [number, number, number] {
  return [node.pos[0] * SPACING, node.pos[1] * SPACING, node.pos[2] * SPACING];
}

export function meshCenter(nodes: MeshNode[]): [number, number, number] {
  if (nodes.length === 0) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const node of nodes) {
    const p = worldPos(node);
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / nodes.length, y / nodes.length, z / nodes.length];
}

export function meshRadius(nodes: MeshNode[]): number {
  if (nodes.length === 0) return 6;
  const c = meshCenter(nodes);
  let max = 0;
  for (const node of nodes) {
    const p = worldPos(node);
    const d = Math.hypot(p[0] - c[0], p[2] - c[2]);
    if (d > max) max = d;
  }
  return Math.max(4, max);
}

export interface StatusVisual {
  haloIntensity: number;
  pulseHz: number;
  bodyDim: number;
}

export const STATUS_VISUALS: Record<string, StatusVisual> = {
  healthy: { haloIntensity: 0.8, pulseHz: 0, bodyDim: 1 },
  warning: { haloIntensity: 1.45, pulseHz: 0.7, bodyDim: 1 },
  violation: { haloIntensity: 2.5, pulseHz: 2.4, bodyDim: 1 },
  awaiting_human: { haloIntensity: 2.3, pulseHz: 1.15, bodyDim: 0.95 },
  isolated: { haloIntensity: 1, pulseHz: 0, bodyDim: 0.4 },
  offline: { haloIntensity: 0.25, pulseHz: 0, bodyDim: 0.22 },
};

export function statusVisual(status: string): StatusVisual {
  return STATUS_VISUALS[status] ?? STATUS_VISUALS.offline;
}
