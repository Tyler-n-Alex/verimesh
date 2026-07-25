"use client";

import { create } from "zustand";

export interface PerfState {
  fps: number;
  calls: number;
  triangles: number;
  worst: number;
  set: (next: { fps: number; calls: number; triangles: number }) => void;
}

export const usePerfStore = create<PerfState>((set) => ({
  fps: 0,
  calls: 0,
  triangles: 0,
  worst: 999,
  set: ({ fps, calls, triangles }) =>
    set((state) => ({
      fps,
      calls,
      triangles,
      worst: fps > 0 ? Math.min(state.worst, fps) : state.worst,
    })),
}));
