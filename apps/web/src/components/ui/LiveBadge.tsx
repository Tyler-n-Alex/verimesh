"use client";

import { ACCENT, NEUTRAL } from "@/lib/palette";

export function LiveBadge({
  label,
  stale,
  compact = false,
}: {
  label: string;
  stale: boolean;
  compact?: boolean;
}) {
  const tone = stale ? "#c9a13f" : ACCENT;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-1.5 py-[3px] text-[11.5px] leading-none whitespace-nowrap"
      style={{
        borderColor: `${tone}4d`,
        background: `${tone}14`,
        color: tone,
      }}
      title={
        stale
          ? `${label} has stopped reporting — the agent falls back to simulating this node`
          : `${label} is reporting live telemetry from its own sensors`
      }
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${stale ? "" : "animate-attention"}`}
        style={{ background: tone }}
      />
      {stale ? "No signal" : "Live"}
      {compact ? null : (
        <span style={{ color: NEUTRAL.dim }}>· {label}</span>
      )}
    </span>
  );
}
