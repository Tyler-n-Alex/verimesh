"use client";

import { useEffect, useState } from "react";

const STEPS = [1, 1.15, 1.3] as const;
const STORAGE_KEY = "verimesh.projector";

export function ProjectorToggle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return;
    const parsed = Number(stored);
    const found = STEPS.findIndex((s) => s === parsed);
    if (found >= 0) setIndex(found);
  }, []);

  useEffect(() => {
    const scale = STEPS[index];
    document.documentElement.style.setProperty("--ui-scale", String(scale));
    window.localStorage.setItem(STORAGE_KEY, String(scale));
    window.dispatchEvent(new Event("resize"));
  }, [index]);

  const scale = STEPS[index];

  return (
    <button
      type="button"
      onClick={() => setIndex((i) => (i + 1) % STEPS.length)}
      title="Scale the whole console up for a projector. Cycles 100% / 115% / 130%."
      className="data shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] leading-none tracking-wide transition-colors"
      style={{
        borderColor: scale === 1 ? "#2b364d" : "#22d3ee66",
        background: scale === 1 ? "transparent" : "#22d3ee14",
        color: scale === 1 ? "#5b6880" : "#22d3ee",
      }}
    >
      {scale === 1 ? "projector" : `${Math.round(scale * 100)}%`}
    </button>
  );
}
