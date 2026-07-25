"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { NodeInstances } from "@/components/mesh/NodeInstances";
import { EdgeLines } from "@/components/mesh/EdgeLines";
import { NodeLabels } from "@/components/mesh/NodeLabels";
import { CameraRig } from "@/components/mesh/CameraRig";
import { PerfProbe } from "@/components/mesh/PerfProbe";
import { useMeshStore } from "@/store/mesh";
import { meshCenter, meshRadius } from "@/lib/layout";

export function MeshScene() {
  const selectNode = useMeshStore((s) => s.selectNode);

  return (
    <Canvas
      dpr={[1, 1.6]}
      frameloop="always"
      camera={{ position: [8.5, 7.5, 10], fov: 42, near: 0.1, far: 120 }}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        depth: true,
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = new THREE.Color("#05070d");
        scene.fog = new THREE.Fog("#05070d", 22, 46);
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
      <ambientLight intensity={0.28} />
      <hemisphereLight args={["#93c5fd", "#0b1220", 0.35]} />
      <directionalLight position={[8, 14, 6]} intensity={1.15} color="#dbeafe" />
      <pointLight position={[-9, 5, -7]} intensity={22} color="#38bdf8" distance={26} />
      <pointLight position={[9, 4, 8]} intensity={16} color="#fb923c" distance={26} />

      <Grid
        position={[center[0], -0.66, center[2]]}
        args={[radius * 6, radius * 6]}
        cellSize={0.875}
        cellThickness={0.5}
        cellColor="#16203a"
        sectionSize={3.5}
        sectionThickness={0.9}
        sectionColor="#233457"
        fadeDistance={radius * 5.5}
        fadeStrength={1.4}
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
        dampingFactor={0.075}
        enablePan
        minDistance={4}
        maxDistance={34}
        minPolarAngle={0.16}
        maxPolarAngle={Math.PI / 2.12}
        autoRotate={false}
      />

      <CameraRig center={center} radius={radius} />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={0.95}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.18}
          mipmapBlur
          radius={0.62}
        />
        <Vignette offset={0.28} darkness={0.62} eskil={false} />
      </EffectComposer>
    </>
  );
}
