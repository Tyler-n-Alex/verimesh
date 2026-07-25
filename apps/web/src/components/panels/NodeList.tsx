"use client";

import { useMemo } from "react";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { Dot } from "@/components/ui/Pill";
import { operatorSwatch, statusSwatch } from "@/lib/palette";
import { useMeshStore } from "@/store/mesh";

export function NodeList() {
  const nodes = useMeshStore((s) => s.nodes);
  const nodeIds = useMeshStore((s) => s.nodeIds);
  const hydrated = useMeshStore((s) => s.hydrated);
  const link = useMeshStore((s) => s.link);
  const linkError = useMeshStore((s) => s.linkError);
  const selectedNodeId = useMeshStore((s) => s.selectedNodeId);
  const selectNode = useMeshStore((s) => s.selectNode);

  const rows = useMemo(
    () => nodeIds.map((id) => nodes[id]).filter(Boolean),
    [nodeIds, nodes]
  );

  if (link === "error" && !hydrated) {
    return (
      <EmptyState
        tone="error"
        title="mesh unreachable"
        hint={linkError ?? "Supabase did not answer."}
      />
    );
  }

  if (!hydrated) return <SkeletonRows rows={8} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="no nodes seeded"
        hint="Run `pnpm --filter @verimesh/agent seed` to populate the mesh."
      />
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10 bg-panel-raised">
        <tr className="border-b border-hairline">
          <Th className="w-[38%]">node</Th>
          <Th className="w-[16%]">op</Th>
          <Th className="w-[16%] text-right">load</Th>
          <Th className="w-[16%] text-right">temp</Th>
          <Th className="w-[14%] text-right">status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((node) => {
          const op = operatorSwatch(node.operator);
          const st = statusSwatch(node.status);
          const selected = selectedNodeId === node.id;
          return (
            <tr
              key={node.id}
              onClick={() => selectNode(selected ? null : node.id)}
              className={`cursor-pointer border-b border-hairline/50 transition-colors ${
                selected ? "bg-signal/10" : "hover:bg-panel-raised"
              }`}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Dot color={op.hex} size={7} />
                  <span className="data text-[12px] text-ink">{node.name}</span>
                </div>
              </td>
              <td className="px-3 py-1.5">
                <span className="data text-[11px]" style={{ color: op.hex }}>
                  {node.operator}
                </span>
              </td>
              <td className="data px-3 py-1.5 text-right text-[12px] text-ink-dim">
                {(node.metrics.load * 100).toFixed(0)}%
              </td>
              <td className="data px-3 py-1.5 text-right text-[12px] text-ink-dim">
                {node.metrics.temp.toFixed(1)}°
              </td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className="data text-[10px] tracking-wide uppercase"
                  style={{ color: st.hex }}
                >
                  {node.status === "awaiting_human" ? "human" : node.status}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`panel-label px-3 py-1.5 text-left text-[9px] ${className}`}>
      {children}
    </th>
  );
}
