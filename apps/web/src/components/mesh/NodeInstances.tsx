"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useMeshStore } from "@/store/mesh";
import { operatorSwatch, statusSwatch } from "@/lib/palette";
import { NODE_RADIUS, SPACING, TILE, statusVisual, worldPos } from "@/lib/layout";

const dummy = new THREE.Object3D();
const scratchColor = new THREE.Color();
const baseColor = new THREE.Color();

export function NodeInstances() {
  const nodeIds = useMeshStore((s) => s.nodeIds);
  const selectNode = useMeshStore((s) => s.selectNode);

  const bodies = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef<number>(-1);

  const count = Math.max(nodeIds.length, 1);

  const bodyGeometry = useMemo(
    () => new THREE.IcosahedronGeometry(NODE_RADIUS, 1),
    []
  );
  const haloGeometry = useMemo(
    () => new THREE.TorusGeometry(NODE_RADIUS * 1.85, 0.032, 8, 40),
    []
  );
  const tileGeometry = useMemo(() => new THREE.PlaneGeometry(TILE, TILE), []);

  useEffect(() => {
    return () => {
      bodyGeometry.dispose();
      haloGeometry.dispose();
      tileGeometry.dispose();
    };
  }, [bodyGeometry, haloGeometry, tileGeometry]);

  useEffect(() => {
    const body = bodies.current;
    const halo = halos.current;
    const tile = tiles.current;
    if (!body || !halo || !tile) return;
    const { nodes } = useMeshStore.getState();

    for (let i = 0; i < nodeIds.length; i++) {
      const node = nodes[nodeIds[i]];
      if (!node) continue;
      const op = operatorSwatch(node.operator);

      const p = worldPos(node);
      dummy.position.set(p[0], p[1] - 0.62, p[2]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      tile.setMatrixAt(i, dummy.matrix);
      scratchColor.set(op.hex).multiplyScalar(0.32);
      tile.setColorAt(i, scratchColor);
    }
    tile.count = nodeIds.length;
    tile.instanceMatrix.needsUpdate = true;
    if (tile.instanceColor) tile.instanceColor.needsUpdate = true;

    body.count = nodeIds.length;
    halo.count = nodeIds.length;
    body.computeBoundingSphere();
  }, [nodeIds]);

  useFrame((state) => {
    const body = bodies.current;
    const halo = halos.current;
    if (!body || !halo) return;

    const { nodes, selectedNodeId } = useMeshStore.getState();
    const t = state.clock.elapsedTime;

    for (let i = 0; i < nodeIds.length; i++) {
      const node = nodes[nodeIds[i]];
      if (!node) continue;

      const vis = statusVisual(node.status);
      const op = operatorSwatch(node.operator);
      const st = statusSwatch(node.status);
      const isSelected = selectedNodeId === node.id;
      const isHovered = hovered.current === i;

      const p = worldPos(node);
      const load = Math.min(1.4, Math.max(0.15, node.metrics.load));

      const bob = vis.pulseHz > 0 ? Math.sin(t * vis.pulseHz * 2) * 0.035 : 0;
      const lift = isSelected ? 0.16 : isHovered ? 0.07 : 0;

      dummy.position.set(p[0], p[1] + lift + bob, p[2]);
      dummy.rotation.set(0, t * 0.12 + i, 0);
      dummy.scale.set(1, 0.72 + load * 0.75, 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      baseColor.set(op.hex);
      if (vis.bodyDim !== 1) baseColor.multiplyScalar(vis.bodyDim);
      if (isSelected || isHovered) baseColor.multiplyScalar(1.5);
      body.setColorAt(i, baseColor);

      const pulse =
        vis.pulseHz > 0
          ? 1 + Math.sin(t * vis.pulseHz * Math.PI * 2) * 0.18
          : 1;
      const haloScale = (isSelected ? 1.16 : 1) * pulse;

      dummy.position.set(p[0], p[1] - 0.5, p[2]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(haloScale, haloScale, 1);
      dummy.updateMatrix();
      halo.setMatrixAt(i, dummy.matrix);

      scratchColor.set(st.hex).multiplyScalar(
        vis.haloIntensity * (isSelected ? 1.5 : 1)
      );
      halo.setColorAt(i, scratchColor);
    }

    body.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
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
          opacity={0.14}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh
        ref={halos}
        args={[haloGeometry, undefined, count]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} transparent opacity={0.95} />
      </instancedMesh>

      <instancedMesh
        ref={bodies}
        args={[bodyGeometry, undefined, count]}
        frustumCulled={false}
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
      >
        <meshStandardMaterial
          metalness={0.55}
          roughness={0.28}
          envMapIntensity={0.4}
        />
      </instancedMesh>
    </group>
  );
}
