"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const DIRECTION = new THREE.Vector3(0.6, 0.58, 0.95).normalize();
const target = new THREE.Vector3();

const MARGIN = 1.18;

export function CameraRig({
  center,
  radius,
}: {
  center: [number, number, number];
  radius: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const lastFit = useRef("");

  const fit = useCallback(
    (force: boolean) => {
      if (!(camera instanceof THREE.PerspectiveCamera)) return;

      const aspect = camera.aspect > 0 ? camera.aspect : 1;
      const key = `${center.join(",")}|${radius.toFixed(2)}|${aspect.toFixed(3)}`;
      if (!force && lastFit.current === key) return;
      lastFit.current = key;

      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const fitRadius = radius * MARGIN;
      const distance = Math.max(
        fitRadius / Math.sin(vFov / 2),
        fitRadius / Math.sin(hFov / 2)
      );

      target.set(center[0], center[1] + radius * 0.05, center[2]);
      camera.position.copy(DIRECTION).multiplyScalar(distance).add(target);
      camera.lookAt(target);
      camera.updateProjectionMatrix();

      const orbit = controls as unknown as
        | { target: THREE.Vector3; update: () => void }
        | undefined;
      if (orbit?.target) {
        orbit.target.copy(target);
        orbit.update();
      }
    },
    [camera, controls, center, radius]
  );

  useEffect(() => {
    fit(true);
  }, [fit]);

  useFrame(() => {
    fit(false);
  });

  return null;
}
