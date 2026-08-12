"use client";

import { create } from "zustand";
import type { Source } from "@/lib/subgraph";

export interface SubgraphHealth {
  source: Source | null;
  error: string | null;
  ms: number;
  endpoint: string;
  stale: boolean;
  ageMs: number;
  report: (next: {
    source: Source;
    error: string | null;
    ms: number;
    endpoint: string;
    stale: boolean;
    ageMs: number;
  }) => void;
}

export const useSubgraphHealth = create<SubgraphHealth>((set) => ({
  source: null,
  error: null,
  ms: 0,
  endpoint: "",
  stale: false,
  ageMs: 0,
  report: ({ source, error, ms, endpoint, stale, ageMs }) =>
    set({ source, error, ms, endpoint, stale, ageMs }),
}));
