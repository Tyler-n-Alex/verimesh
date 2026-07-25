"use client";

import { NEUTRAL, OPERATOR_COLORS, STATUS_ORDER, STATUS_TOKENS } from "@/lib/palette";

export function MeshLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5">
      <span className="flex items-center gap-2">
        <span className="text-[11.5px] text-ink-faint">Operator</span>
        {Object.keys(OPERATOR_COLORS).map((id) => (
          <span key={id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-[2px]"
              style={{ background: OPERATOR_COLORS[id].hex }}
            />
            <span className="text-[11.5px] text-ink-dim">{id}</span>
          </span>
        ))}
      </span>

      <span className="h-3.5 w-px bg-hairline" />

      <span className="flex items-center gap-2.5">
        <span className="text-[11.5px] text-ink-faint">Status</span>
        {STATUS_ORDER.map((status) => {
          const token = STATUS_TOKENS[status];
          return (
            <span key={status} className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className="text-[10px] leading-none"
                style={{
                  color: token.severity === "none" ? NEUTRAL.faint : token.hex,
                }}
              >
                {token.glyph}
              </span>
              <span className="text-[11.5px] text-ink-dim">{token.label}</span>
            </span>
          );
        })}
      </span>

      <span className="h-3.5 w-px bg-hairline" />

      <span
        className="flex items-center gap-1.5"
        title="An edge takes each endpoint's own operator colour, so a cross-operator link reads as a gradient between two operators."
      >
        <span
          aria-hidden="true"
          className="h-px w-6"
          style={{
            background:
              "repeating-linear-gradient(90deg,#8fa6cc 0 4px,transparent 4px 7px)",
          }}
        />
        <span className="text-[11.5px] text-ink-dim">Cross-operator link</span>
      </span>
    </div>
  );
}
