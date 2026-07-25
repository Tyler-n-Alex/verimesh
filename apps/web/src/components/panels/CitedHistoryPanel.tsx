"use client";

import { useState } from "react";
import { clock } from "@/lib/format";
import { NEUTRAL, verdictSwatch } from "@/lib/palette";
import type { CitedHistory } from "@/lib/trace";
import { HISTORY_QUERY } from "@/lib/subgraph";

export function CitedHistoryPanel({ cited }: { cited: CitedHistory }) {
  const [showQuery, setShowQuery] = useState(false);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-hairline bg-abyss p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[12.5px] font-medium text-ink">
          The agent cited this
        </h4>
        <button
          type="button"
          onClick={() => setShowQuery((v) => !v)}
          className="text-[11.5px] text-ink-faint transition-colors hover:text-ink-dim"
        >
          {showQuery ? "Hide query" : "Show query"}
        </button>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-faint">
        The exact subgraph result that was in the model&apos;s context when it
        proposed — indexed from the on-chain registry, not from this
        application&apos;s database.
      </p>

      {showQuery ? (
        <pre className="scroll-thin data max-h-40 overflow-auto rounded border border-hairline bg-void px-2.5 py-2 text-[11px] leading-relaxed text-ink-dim">
          {HISTORY_QUERY.trim()}
        </pre>
      ) : null}

      {cited.parsed && cited.entries.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {cited.entries.map((entry, i) => {
            const vd = verdictSwatch(entry.verdict);
            return (
              <li
                key={`${entry.nodeId}-${entry.ts}-${i}`}
                className="flex flex-col gap-1 rounded border border-hairline bg-panel px-2.5 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <span className="text-[12.5px] font-medium text-ink">
                    {entry.nodeId}
                  </span>
                  <span className="text-[11.5px] text-ink-faint">
                    {entry.operator}
                  </span>
                  <span className="text-[12px] text-ink-dim">
                    {entry.action}
                  </span>
                  <span
                    className="text-[11.5px]"
                    style={{
                      color:
                        vd.severity === "none" ? NEUTRAL.faint : vd.hex,
                    }}
                  >
                    {vd.label}
                  </span>
                  <span className="num ml-auto text-[11.5px] text-ink-faint">
                    {clock(entry.ts)}
                  </span>
                </div>
                {entry.outcome ? (
                  <span className="text-[12px] leading-relaxed text-ink-faint">
                    {entry.outcome}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : cited.parsed ? (
        <p className="text-[12px] text-ink-faint">
          No prior records — this is the first incident the subgraph has for this
          node.
        </p>
      ) : (
        <pre className="scroll-thin max-h-44 overflow-auto rounded border border-hairline bg-panel px-2.5 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-ink-dim">
          {cited.raw}
        </pre>
      )}
    </div>
  );
}
