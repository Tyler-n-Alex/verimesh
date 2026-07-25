"use client";

import { create } from "zustand";
import type { Source } from "@/lib/subgraph";

export interface SubgraphHealth {
  source: Source | null;
  error: string | null;
  ms: number;
  endpoint: string;
  report: (next: {
    source: Source;
    error: string | null;
    ms: number;
    endpoint: string;
  }) => void;
}

export const useSubgraphHealth = create<SubgraphHealth>((set) => ({
  source: null,
  error: null,
  ms: 0,
  endpoint: "",
  report: ({ source, error, ms, endpoint }) =>
    set({ source, error, ms, endpoint }),
}));
