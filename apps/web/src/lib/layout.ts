import type { MeshNode } from "@/lib/db";

export const SPACING = 1.75;
export const NODE_RADIUS = 0.32;
export const TILE = 1.5;

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
  ring: boolean;
  ringOpacity: number;
  pulseHz: number;
  bodyDim: number;
}

export const STATUS_VISUALS: Record<string, StatusVisual> = {
  healthy: { ring: false, ringOpacity: 0, pulseHz: 0, bodyDim: 1 },
  warning: { ring: true, ringOpacity: 0.85, pulseHz: 0, bodyDim: 1 },
  violation: { ring: true, ringOpacity: 1, pulseHz: 0.7, bodyDim: 1 },
  awaiting_human: { ring: true, ringOpacity: 0.95, pulseHz: 0.45, bodyDim: 0.9 },
  isolated: { ring: true, ringOpacity: 0.5, pulseHz: 0, bodyDim: 0.5 },
  offline: { ring: false, ringOpacity: 0, pulseHz: 0, bodyDim: 0.32 },
};

export function statusVisual(status: string): StatusVisual {
  return STATUS_VISUALS[status] ?? STATUS_VISUALS.offline;
}
