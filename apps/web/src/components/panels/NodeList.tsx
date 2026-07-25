"use client";

import { useMemo } from "react";
import { EmptyState, SkeletonRows } from "@/components/ui/Panel";
import { StatusTag } from "@/components/ui/Pill";
import { NEUTRAL, statusToken } from "@/lib/palette";
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
        title="Mesh unreachable"
        hint={linkError ?? "Supabase did not answer."}
      />
    );
  }

  if (!hydrated) return <SkeletonRows rows={8} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No nodes seeded"
        hint="Run pnpm --filter @verimesh/agent seed to populate the mesh."
      />
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-hairline">
          <Th className="w-[34%]">Node</Th>
          <Th className="w-[14%]">Operator</Th>
          <Th className="w-[13%] text-right">Load</Th>
          <Th className="w-[13%] text-right">Temp</Th>
          <Th className="w-[26%]">Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((node) => {
          const selected = selectedNodeId === node.id;
          const token = statusToken(node.status);
          const alarming = token.severity === "danger";
          return (
            <tr
              key={node.id}
              onClick={() => selectNode(selected ? null : node.id)}
              className={`row-hover cursor-pointer border-b border-hairline/60 ${
                selected ? "bg-panel-raised" : ""
              }`}
            >
              <td className="px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{
                      background: `var(--${node.operator.toLowerCase()}, ${NEUTRAL.faint})`,
                    }}
                  />
                  <span className="text-[13px] text-ink">{node.name}</span>
                </div>
              </td>
              <td className="px-3.5 py-2 text-[12.5px] text-ink-dim">
                {node.operator}
              </td>
              <td
                className="num px-3.5 py-2 text-right text-[12.5px]"
                style={{ color: alarming ? token.hex : NEUTRAL.dim }}
              >
                {(node.metrics.load * 100).toFixed(0)}%
              </td>
              <td
                className="num px-3.5 py-2 text-right text-[12.5px]"
                style={{ color: alarming ? token.hex : NEUTRAL.dim }}
              >
                {node.metrics.temp.toFixed(1)}°
              </td>
              <td className="px-3.5 py-2">
                <StatusTag status={node.status} />
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
    <th
      className={`px-3.5 py-2 text-left text-[11.5px] font-medium text-ink-faint ${className}`}
    >
      {children}
    </th>
  );
}
