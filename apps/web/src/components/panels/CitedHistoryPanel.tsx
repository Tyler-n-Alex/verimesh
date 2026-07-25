"use client";

import { useState } from "react";
import { clock } from "@/lib/format";
import { operatorSwatch, verdictSwatch } from "@/lib/palette";
import type { CitedHistory } from "@/lib/trace";
import { HISTORY_QUERY } from "@/lib/subgraph";

export function CitedHistoryPanel({ cited }: { cited: CitedHistory }) {
  const [showQuery, setShowQuery] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[#c084fc40] bg-[#c084fc0d] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="panel-label text-[9px] tracking-[0.16em]"
          style={{ color: "#c084fc" }}
        >
          ◈ the agent cited this
        </span>
        <button
          type="button"
          onClick={() => setShowQuery((v) => !v)}
          className="data text-[10px] text-ink-faint transition-colors hover:text-ink-dim"
        >
          {showQuery ? "hide query" : "show query"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        The exact subgraph result that was in the model&apos;s context when it
        proposed. Indexed from the on-chain registry — not from this app&apos;s
        database.
      </p>

      {showQuery ? (
        <pre className="scroll-thin data max-h-40 overflow-auto rounded-sm border border-hairline bg-void px-2 py-1.5 text-[10px] leading-relaxed text-ink-dim">
          {HISTORY_QUERY.trim()}
        </pre>
      ) : null}

      {cited.parsed && cited.entries.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {cited.entries.map((entry, i) => {
            const op = operatorSwatch(entry.operator);
            const vd = verdictSwatch(entry.verdict);
            return (
              <li
                key={`${entry.nodeId}-${entry.ts}-${i}`}
                className="flex flex-col gap-0.5 rounded-sm border border-hairline bg-void/70 px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="data text-[11.5px] font-semibold text-ink">
                    {entry.nodeId}
                  </span>
                  <span className="data text-[10px]" style={{ color: op.hex }}>
                    {entry.operator}
                  </span>
                  <span className="data text-[11px] text-ink-dim">
                    {entry.action}
                  </span>
                  <span className="data text-[10px]" style={{ color: vd.hex }}>
                    {vd.label}
                  </span>
                  <span className="data ml-auto text-[10px] text-ink-faint">
                    {clock(entry.ts)}
                  </span>
                </div>
                {entry.outcome ? (
                  <span className="text-[11px] leading-snug text-ink-faint">
                    {entry.outcome}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : cited.parsed ? (
        <p className="data text-[11px] text-ink-faint">
          no prior records — this is the first incident the subgraph has for this
          node
        </p>
      ) : (
        <pre className="scroll-thin max-h-44 overflow-auto rounded-sm border border-hairline bg-void px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-dim">
          {cited.raw}
        </pre>
      )}
    </div>
  );
}
