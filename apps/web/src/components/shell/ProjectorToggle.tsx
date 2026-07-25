"use client";

import { useEffect, useState } from "react";
import { NEUTRAL } from "@/lib/palette";

const STEPS = [1, 1.15, 1.3] as const;
const STORAGE_KEY = "verimesh.projector";

export function ProjectorToggle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return;
    const found = STEPS.findIndex((s) => s === Number(stored));
    if (found >= 0) setIndex(found);
  }, []);

  useEffect(() => {
    const scale = STEPS[index];
    document.documentElement.style.setProperty("--ui-scale", String(scale));
    window.localStorage.setItem(STORAGE_KEY, String(scale));
    window.dispatchEvent(new Event("resize"));
  }, [index]);

  const scale = STEPS[index];
  const on = scale !== 1;

  return (
    <button
      type="button"
      onClick={() => setIndex((i) => (i + 1) % STEPS.length)}
      title="Scale the whole console up for a projector. Cycles 100%, 115%, 130%."
      className="rounded-md border px-2.5 py-1.5 text-[12px] whitespace-nowrap transition-colors"
      style={{
        borderColor: on ? NEUTRAL.lineBright : NEUTRAL.line,
        background: on ? NEUTRAL.raised : "transparent",
        color: on ? NEUTRAL.text : NEUTRAL.faint,
      }}
    >
      {on ? `Projector ${Math.round(scale * 100)}%` : "Projector"}
    </button>
  );
}
