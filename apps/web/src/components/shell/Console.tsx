"use client";

import { useMemo } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { Panel, EmptyState } from "@/components/ui/Panel";
import { MeshViewport } from "@/components/mesh/MeshViewport";
import { useMeshRealtime } from "@/hooks/useMeshRealtime";
import { operatorCounts, statusCounts, useMeshStore } from "@/store/mesh";

export function Console() {
  useMeshRealtime();

  const nodes = useMeshStore((s) => s.nodes);
  const link = useMeshStore((s) => s.link);
  const linkError = useMeshStore((s) => s.linkError);

  const counts = useMemo(() => statusCounts(nodes), [nodes]);
  const ops = useMemo(() => operatorCounts(nodes), [nodes]);

  return (
    <div className="flex h-screen flex-col bg-void">
      <TopBar
        link={link}
        linkDetail={linkError ?? undefined}
        statusCounts={counts}
        operatorCounts={ops}
        subgraphState="idle"
      />

      <main className="grid min-h-0 flex-1 gap-2 p-2 [grid-template-columns:minmax(300px,21vw)_1fr_minmax(340px,23vw)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Panel label="reasoning trace" className="flex-[3]">
            <EmptyState
              title="agent idle"
              hint="The loop has not proposed anything yet."
            />
          </Panel>
          <Panel label="event log" className="flex-[2]">
            <EmptyState title="no events" />
          </Panel>
        </div>

        <Panel label="mesh" scroll={false}>
          <MeshViewport />
        </Panel>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel label="node inspector" className="flex-[3]">
            <EmptyState
              title="no node selected"
              hint="Click a node in the mesh to inspect it."
            />
          </Panel>
          <Panel label="the graph" className="flex-[2]">
            <EmptyState title="subgraph not configured" />
          </Panel>
        </div>
      </main>
    </div>
  );
}
