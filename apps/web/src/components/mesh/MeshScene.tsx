"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { NodeInstances } from "@/components/mesh/NodeInstances";
import { EdgeLines } from "@/components/mesh/EdgeLines";
import { NodeLabels } from "@/components/mesh/NodeLabels";
import { CameraRig } from "@/components/mesh/CameraRig";
import { PerfProbe } from "@/components/mesh/PerfProbe";
import { useMeshStore } from "@/store/mesh";
import { meshCenter, meshRadius } from "@/lib/layout";

const BACKGROUND = "#0d0d10";

export function MeshScene() {
  const selectNode = useMeshStore((s) => s.selectNode);

  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop="always"
      camera={{ position: [12, 11, 15], fov: 38, near: 0.1, far: 140 }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NoToneMapping;
        scene.background = new THREE.Color(BACKGROUND);
        scene.fog = new THREE.Fog(BACKGROUND, 26, 62);
      }}
      onPointerMissed={() => selectNode(null)}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}

function SceneContents() {
  const nodeIds = useMeshStore((s) => s.nodeIds);

  const { center, radius } = useMemo(() => {
    const { nodes } = useMeshStore.getState();
    const list = nodeIds.map((id) => nodes[id]).filter(Boolean);
    return { center: meshCenter(list), radius: meshRadius(list) };
  }, [nodeIds]);

  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#aab0bd", "#0c0c10", 0.4]} />
      <directionalLight position={[6, 12, 7]} intensity={2.5} color="#ffffff" />
      <directionalLight position={[-9, 5, -7]} intensity={0.5} color="#b8bfcc" />

      <Grid
        position={[center[0], -0.54, center[2]]}
        args={[radius * 6, radius * 6]}
        cellSize={0.875}
        cellThickness={0.5}
        cellColor="#212127"
        sectionSize={3.5}
        sectionThickness={0.9}
        sectionColor="#2e2e35"
        fadeDistance={radius * 5}
        fadeStrength={1.5}
        infiniteGrid={false}
        side={THREE.DoubleSide}
      />

      <EdgeLines />
      <NodeInstances />
      <NodeLabels />
      <PerfProbe />

      <OrbitControls
        makeDefault
        target={center}
        enableDamping
        dampingFactor={0.08}
        enablePan
        minDistance={4}
        maxDistance={40}
        minPolarAngle={0.18}
        maxPolarAngle={Math.PI / 2.15}
      />

      <CameraRig center={center} radius={radius} />
    </>
  );
}
