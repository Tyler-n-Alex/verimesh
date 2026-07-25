"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

const DIRECTION = new THREE.Vector3(0.6, 0.58, 0.95).normalize();
const target = new THREE.Vector3();

export function CameraRig({
  center,
  radius,
}: {
  center: [number, number, number];
  radius: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const size = useThree((s) => s.size);
  const framedFor = useRef<string>("");

  useEffect(() => {
    const key = `${center.join(",")}|${radius}|${Math.round(size.width / 40)}x${Math.round(size.height / 40)}`;
    if (framedFor.current === key) return;
    framedFor.current = key;

    const aspect = size.width / Math.max(1, size.height);
    const widen = aspect < 1.25 ? 1.25 / aspect : 1;
    const distance = radius * 2.32 * widen;

    target.set(center[0], center[1], center[2]);
    camera.position
      .copy(DIRECTION)
      .multiplyScalar(distance)
      .add(target);
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    const orbit = controls as unknown as
      | { target: THREE.Vector3; update: () => void }
      | undefined;
    if (orbit?.target) {
      orbit.target.copy(target);
      orbit.update();
    }
  }, [camera, controls, center, radius, size.width, size.height]);

  return null;
}
