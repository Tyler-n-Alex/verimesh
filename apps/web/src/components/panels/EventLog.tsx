"use client";

import { useMemo, useState } from "react";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { eventColor, operatorSwatch } from "@/lib/palette";
import { clock } from "@/lib/format";
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
        title="event stream unreachable"
        hint={linkError ?? undefined}
      />
    );
  }

  if (!hydrated) return <SkeletonRows rows={6} />;

  if (events.length === 0) {
    return (
      <EmptyState
        title="no events yet"
        hint="The agent loop writes here as it runs."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {selectedNodeId ? (
        <button
          type="button"
          onClick={() => setOnlySelected((v) => !v)}
          className="panel-label sticky top-0 z-10 flex items-center gap-1.5 border-b border-hairline bg-panel-raised px-3 py-1.5 text-left text-[9px] transition-colors hover:text-ink"
        >
          <span
            className="h-2 w-2 rounded-sm border"
            style={{
              borderColor: onlySelected ? "#22d3ee" : "#2b364d",
              background: onlySelected ? "#22d3ee" : "transparent",
            }}
          />
          only {nodes[selectedNodeId]?.name ?? selectedNodeId}
        </button>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="no events for this node"
          hint="Clear the filter to see the whole mesh."
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((event) => {
            const tone = eventColor(event.type);
            const node = event.node_id ? nodes[event.node_id] : undefined;
            return (
              <li
                key={event.id}
                onClick={() => event.node_id && selectNode(event.node_id)}
                className={`animate-rise flex gap-2 border-b border-hairline/40 px-3 py-1.5 ${
                  event.node_id ? "cursor-pointer hover:bg-panel-raised" : ""
                }`}
              >
                <span className="data mt-px shrink-0 text-[10px] text-ink-faint">
                  {clock(event.ts)}
                </span>
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: tone, boxShadow: `0 0 6px ${tone}` }}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className="data text-[10px] tracking-wider uppercase"
                      style={{ color: tone }}
                    >
                      {event.type}
                    </span>
                    {node ? (
                      <span
                        className="data text-[10px]"
                        style={{ color: operatorSwatch(node.operator).hex }}
                      >
                        {node.name}
                      </span>
                    ) : null}
                  </span>
                  {event.message ? (
                    <span className="text-[11.5px] leading-snug break-words text-ink-dim">
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
