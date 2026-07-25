"use client";

import { OPERATOR_COLORS, STATUS_COLORS, STATUS_ORDER } from "@/lib/palette";

export function MeshLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <span className="flex items-center gap-1.5">
        <span className="panel-label text-[8.5px]">fill</span>
        {Object.entries(OPERATOR_COLORS).map(([id, swatch]) => (
          <span key={id} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: swatch.hex,
                boxShadow: `0 0 7px ${swatch.hex}`,
              }}
            />
            <span className="data text-[10.5px]" style={{ color: swatch.hex }}>
              {id}
            </span>
          </span>
        ))}
      </span>

      <span className="h-3 w-px bg-hairline" />

      <span className="flex items-center gap-1.5">
        <span className="panel-label text-[8.5px]">ring</span>
        {STATUS_ORDER.map((status) => (
          <span key={status} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full border-2"
              style={{ borderColor: STATUS_COLORS[status].hex }}
            />
            <span className="data text-[10px] text-ink-dim">
              {status === "awaiting_human" ? "human" : status}
            </span>
          </span>
        ))}
      </span>

      <span className="h-3 w-px bg-hairline" />

      <span
        className="flex items-center gap-1.5"
        title="An edge is coloured by each endpoint's own operator, so a cross-operator link is a visible gradient between two operator colours."
      >
        <span
          className="h-0.5 w-6"
          style={{
            background:
              "repeating-linear-gradient(90deg,#38bdf8 0 5px,#fb923c 5px 8px)",
          }}
        />
        <span className="data text-[10px] text-ink-dim">cross-operator link</span>
      </span>
    </div>
  );
}
