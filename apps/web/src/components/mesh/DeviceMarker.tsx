"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMeshStore } from "@/store/mesh";
import { ACCENT } from "@/lib/palette";
import { isDeviceStale } from "@/lib/device";
import { worldPos } from "@/lib/layout";

const OUTLINE = new THREE.Color(ACCENT);
const STALE = new THREE.Color("#c9a13f");

export function DeviceMarker() {
  const deviceIds = useMeshStore((s) =>
    s.nodeIds.filter((id) => s.nodes[id]?.kind === "device").join(",")
  );

  const ids = useMemo(
    () => (deviceIds ? deviceIds.split(",") : []),
    [deviceIds]
  );

  if (ids.length === 0) return null;

  return (
    <group>
      {ids.map((id) => (
        <Handset key={id} nodeId={id} />
      ))}
    </group>
  );
}

function Handset({ nodeId }: { nodeId: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  const position = useMeshStore((s) => {
    const node = s.nodes[nodeId];
    return node ? worldPos(node).join(",") : null;
  });

  const geometry = useMemo(
    () => new THREE.RingGeometry(0.66, 0.72, 48),
    []
  );

  useFrame((state) => {
    const mat = material.current;
    if (!mat) return;

    const node = useMeshStore.getState().nodes[nodeId];
    const stale = isDeviceStale(node?.lastSeenAt ?? null);

    mat.color.copy(stale ? STALE : OUTLINE);
    mat.opacity = stale
      ? 0.35
      : 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.2));

    const mesh = ring.current;
    if (mesh) mesh.rotation.z += stale ? 0 : 0.004;
  });

  if (!position) return null;
  const [x, y, z] = position.split(",").map(Number);

  return (
    <mesh
      ref={ring}
      geometry={geometry}
      position={[x, y - 0.44, z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshBasicMaterial
        ref={material}
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
