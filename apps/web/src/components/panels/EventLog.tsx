"use client";

import { useMemo, useState } from "react";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { clock } from "@/lib/format";
import { NEUTRAL, SEVERITY_COLORS, eventSeverity } from "@/lib/palette";
import { useMeshStore } from "@/store/mesh";

export function EventLog() {
  const events = useMeshStore((s) => s.events);
  const hydrated = useMeshStore((s) => s.hydrated);
  const link = useMeshStore((s) => s.link);
  const linkError = useMeshStore((s) => s.linkError);
  const nodes = useMeshStore((s) => s.nodes);
  const selectNode = useMeshStore((s) => s.selectNode);
  const selectedNodeId = useMeshStore((s) => s.selectedNodeId);
  const [onlySelected, setOnlySelected] = useState(false);

  const rows = useMemo(() => {
    if (!onlySelected || !selectedNodeId) return events;
    return events.filter((e) => e.node_id === selectedNodeId);
  }, [events, onlySelected, selectedNodeId]);

  if (link === "error" && !hydrated) {
    return (
      <EmptyState
        tone="error"
        title="Event stream unreachable"
        hint={linkError ?? undefined}
      />
    );
  }

  if (!hydrated) return <SkeletonRows rows={6} />;

  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        hint="The agent loop writes here as it runs."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {selectedNodeId ? (
        <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 border-b border-hairline bg-panel px-3.5 py-2 text-[12px] text-ink-dim">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Only {nodes[selectedNodeId]?.name ?? selectedNodeId}
        </label>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No events for this node"
          hint="Clear the filter to see the whole mesh."
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((event) => {
            const severity = eventSeverity(event.type);
            const tone = SEVERITY_COLORS[severity];
            const node = event.node_id ? nodes[event.node_id] : undefined;
            const emphatic = severity === "danger" || severity === "notice";
            const simulated = (event.message ?? "").includes("SIMULATED");

            return (
              <li
                key={event.id}
                onClick={() => event.node_id && selectNode(event.node_id)}
                className={`animate-rise row-hover flex gap-2.5 border-b border-hairline/60 px-3.5 py-2 ${
                  event.node_id ? "cursor-pointer" : ""
                }`}
              >
                <span className="num mt-px shrink-0 text-[11.5px] text-ink-faint">
                  {clock(event.ts)}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: emphatic ? tone : NEUTRAL.lineBright }}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className="text-[12px]"
                      style={{ color: emphatic ? tone : NEUTRAL.dim }}
                    >
                      {event.type}
                    </span>
                    {node ? (
                      <span className="text-[11.5px] text-ink-faint">
                        {node.name}
                      </span>
                    ) : null}
                    {simulated ? (
                      <span
                        className="rounded-sm px-1 py-px text-[10px] font-medium tracking-wide uppercase"
                        style={{
                          color: "#c9a13f",
                          border: "1px solid #c9a13f55",
                        }}
                      >
                        Simulated
                      </span>
                    ) : null}
                  </span>
                  {event.message ? (
                    <span className="text-[12.5px] leading-relaxed break-words text-ink-dim">
                      {event.message}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
