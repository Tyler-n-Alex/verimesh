"use client";

import { useMemo, useRef, type ComponentRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMeshStore } from "@/store/mesh";
import { operatorSwatch, statusToken } from "@/lib/palette";
import { worldPos } from "@/lib/layout";

type Triple = [number, number, number];
type LineRef = ComponentRef<typeof Line>;

interface EdgeSet {
  points: Triple[];
  colors: Triple[];
}

const ALERT_STATUSES = new Set(["violation", "awaiting_human"]);
const DIM_STATUSES = new Set(["isolated", "offline"]);

function toTriple(hex: string, gain: number): Triple {
  const n = parseInt(hex.slice(1), 16);
  return [
    (((n >> 16) & 255) / 255) * gain,
    (((n >> 8) & 255) / 255) * gain,
    ((n & 255) / 255) * gain,
  ];
}

export function EdgeLines() {
  const edges = useMeshStore((s) => s.edges);
  const nodeIds = useMeshStore((s) => s.nodeIds);

  const alertSignature = useMeshStore((s) => {
    let out = "";
    for (const id of s.nodeIds) {
      const status = s.nodes[id]?.status;
      if (status && ALERT_STATUSES.has(status)) out += `${id}:${status}|`;
    }
    return out;
  });

  const crossRef = useRef<LineRef>(null);
  const alertRef = useRef<LineRef>(null);

  const { intra, cross } = useMemo(() => {
    const { nodes } = useMeshStore.getState();
    const intraSet: EdgeSet = { points: [], colors: [] };
    const crossSet: EdgeSet = { points: [], colors: [] };

    for (const edge of edges) {
      const a = nodes[edge.from];
      const b = nodes[edge.to];
      if (!a || !b) continue;

      if (edge.crossOperator) {
        crossSet.points.push(worldPos(a), worldPos(b));
        crossSet.colors.push(
          toTriple(operatorSwatch(a.operator).hex, 0.72),
          toTriple(operatorSwatch(b.operator).hex, 0.72)
        );
      } else {
        intraSet.points.push(worldPos(a), worldPos(b));
        intraSet.colors.push([0.36, 0.36, 0.4], [0.36, 0.36, 0.4]);
      }
    }
    return { intra: intraSet, cross: crossSet };
  }, [edges, nodeIds]);

  const alert = useMemo(() => {
    const { nodes } = useMeshStore.getState();
    const set: EdgeSet = { points: [], colors: [] };
    if (!alertSignature) return set;

    for (const edge of edges) {
      const a = nodes[edge.from];
      const b = nodes[edge.to];
      if (!a || !b) continue;
      const aHot = ALERT_STATUSES.has(a.status);
      const bHot = ALERT_STATUSES.has(b.status);
      if (!aHot && !bHot) continue;
      if (DIM_STATUSES.has(a.status) || DIM_STATUSES.has(b.status)) continue;

      const hot = statusToken(aHot ? a.status : b.status).hex;
      set.points.push(worldPos(a), worldPos(b));
      set.colors.push(toTriple(hot, 0.95), toTriple(hot, 0.95));
    }
    return set;
  }, [edges, alertSignature]);

  useFrame((_, delta) => {
    const { nodes, nodeIds: ids } = useMeshStore.getState();
    let load = 0;
    for (const id of ids) load += nodes[id]?.metrics.load ?? 0;
    const avg = ids.length > 0 ? load / ids.length : 0.4;

    const crossMat = crossRef.current?.material;
    if (crossMat) crossMat.dashOffset -= delta * (0.04 + avg * 0.16);

    const alertMat = alertRef.current?.material;
    if (alertMat) alertMat.dashOffset -= delta * 0.34;
  });

  return (
    <group>
      {intra.points.length >= 2 ? (
        <Line
          segments
          points={intra.points}
          vertexColors={intra.colors}
          lineWidth={1}
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      ) : null}

      {cross.points.length >= 2 ? (
        <Line
          ref={crossRef}
          segments
          points={cross.points}
          vertexColors={cross.colors}
          lineWidth={1.8}
          dashed
          dashSize={0.24}
          gapSize={0.14}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      ) : null}

      {alert.points.length >= 2 ? (
        <Line
          ref={alertRef}
          segments
          points={alert.points}
          vertexColors={alert.colors}
          lineWidth={2.2}
          dashed
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      ) : null}
    </group>
  );
}
