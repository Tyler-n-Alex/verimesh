"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { usePerfStore } from "@/store/perf";

const SAMPLE_MS = 500;

export function PerfProbe() {
  const frames = useRef(0);
  const since = useRef(0);

  useFrame((state, delta) => {
    frames.current += 1;
    since.current += delta * 1000;
    if (since.current < SAMPLE_MS) return;

    const fps = Math.round((frames.current * 1000) / since.current);
    const info = state.gl.info;
    usePerfStore.getState().set({
      fps,
      calls: info.render.calls,
      triangles: info.render.triangles,
    });

    frames.current = 0;
    since.current = 0;
  });

  return null;
}
