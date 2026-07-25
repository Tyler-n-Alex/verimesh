"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useMeshStore } from "@/store/mesh";
import { ACCENT, operatorSwatch, statusToken } from "@/lib/palette";
import { NODE_RADIUS, TILE, statusVisual, worldPos } from "@/lib/layout";

const dummy = new THREE.Object3D();
const scratch = new THREE.Color();
const body = new THREE.Color();
const HIDDEN = new THREE.Color("#000000");

export function NodeInstances() {
  const nodeIds = useMeshStore((s) => s.nodeIds);
  const selectNode = useMeshStore((s) => s.selectNode);

  const bodies = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef<number>(-1);

  const count = Math.max(nodeIds.length, 1);

  const bodyGeometry = useMemo(
    () => new THREE.CylinderGeometry(NODE_RADIUS, NODE_RADIUS, 0.34, 24, 1),
    []
  );
  const ringGeometry = useMemo(
    () => new THREE.TorusGeometry(NODE_RADIUS * 1.9, 0.018, 6, 48),
    []
  );
  const tileGeometry = useMemo(() => new THREE.PlaneGeometry(TILE, TILE), []);

  useEffect(
    () => () => {
      bodyGeometry.dispose();
      ringGeometry.dispose();
      tileGeometry.dispose();
    },
    [bodyGeometry, ringGeometry, tileGeometry]
  );

  useEffect(() => {
    const tile = tiles.current;
    const bodyMesh = bodies.current;
    const ringMesh = rings.current;
    if (!tile || !bodyMesh || !ringMesh) return;
    const { nodes } = useMeshStore.getState();

    for (let i = 0; i < nodeIds.length; i++) {
      const node = nodes[nodeIds[i]];
      if (!node) continue;
      const p = worldPos(node);
      dummy.position.set(p[0], p[1] - 0.5, p[2]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      tile.setMatrixAt(i, dummy.matrix);
      scratch.set(operatorSwatch(node.operator).hex).multiplyScalar(0.09);
      tile.setColorAt(i, scratch);
    }

    tile.count = nodeIds.length;
    tile.instanceMatrix.needsUpdate = true;
    if (tile.instanceColor) tile.instanceColor.needsUpdate = true;

    bodyMesh.count = nodeIds.length;
    ringMesh.count = nodeIds.length;
    bodyMesh.computeBoundingSphere();
  }, [nodeIds]);

  useFrame((state) => {
    const bodyMesh = bodies.current;
    const ringMesh = rings.current;
    if (!bodyMesh || !ringMesh) return;

    const { nodes, selectedNodeId } = useMeshStore.getState();
    const t = state.clock.elapsedTime;

    for (let i = 0; i < nodeIds.length; i++) {
      const node = nodes[nodeIds[i]];
      if (!node) continue;

      const vis = statusVisual(node.status);
      const op = operatorSwatch(node.operator);
      const token = statusToken(node.status);
      const selected = selectedNodeId === node.id;
      const hover = hovered.current === i;

      const p = worldPos(node);
      const load = Math.min(1.3, Math.max(0.12, node.metrics.load));
      const lift = selected ? 0.1 : hover ? 0.045 : 0;

      dummy.position.set(p[0], p[1] + lift + load * 0.16, p[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 0.5 + load * 0.95, 1);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);

      body.set(op.hex).multiplyScalar(vis.bodyDim * (selected || hover ? 1.15 : 1));
      bodyMesh.setColorAt(i, body);

      if (vis.ring || selected) {
        const fade =
          vis.pulseHz > 0
            ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * vis.pulseHz * Math.PI * 2))
            : 1;
        const scale = selected ? 1.14 : 1;
        dummy.position.set(p[0], p[1] - 0.42, p[2]);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(scale, scale, 1);
        dummy.updateMatrix();
        ringMesh.setMatrixAt(i, dummy.matrix);

        scratch
          .set(vis.ring ? token.hex : ACCENT)
          .multiplyScalar(vis.ring ? vis.ringOpacity * fade : 0.8);
        ringMesh.setColorAt(i, scratch);
      } else {
        dummy.position.set(p[0], -999, p[2]);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        ringMesh.setMatrixAt(i, dummy.matrix);
        ringMesh.setColorAt(i, HIDDEN);
      }
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const id = event.instanceId;
    if (id === undefined) return;
    const nodeId = nodeIds[id];
    if (!nodeId) return;
    const { selectedNodeId } = useMeshStore.getState();
    selectNode(selectedNodeId === nodeId ? null : nodeId);
  };

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hovered.current = event.instanceId ?? -1;
    document.body.style.cursor = hovered.current >= 0 ? "pointer" : "auto";
  };

  const handleOut = () => {
    hovered.current = -1;
    document.body.style.cursor = "auto";
  };

  return (
    <group>
      <instancedMesh
        ref={tiles}
        args={[tileGeometry, undefined, count]}
        frustumCulled={false}
        renderOrder={-1}
      >
        <meshBasicMaterial
          transparent
          opacity={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      <instancedMesh
        ref={rings}
        args={[ringGeometry, undefined, count]}
        frustumCulled={false}
      >
        <meshBasicMaterial transparent opacity={0.92} depthWrite={false} />
      </instancedMesh>

      <instancedMesh
        ref={bodies}
        args={[bodyGeometry, undefined, count]}
        frustumCulled={false}
        castShadow
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
      >
        <meshStandardMaterial metalness={0.22} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}
