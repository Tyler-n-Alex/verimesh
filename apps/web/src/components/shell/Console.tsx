"use client";

import { useMemo } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { Panel } from "@/components/ui/Panel";
import { MeshViewport } from "@/components/mesh/MeshViewport";
import { TracePanel } from "@/components/panels/TracePanel";
import { EventLog } from "@/components/panels/EventLog";
import { NodeInspector } from "@/components/panels/NodeInspector";
import { GraphPanel } from "@/components/panels/GraphPanel";
import { FreezeModal } from "@/components/panels/FreezeModal";
import { AuditDrawer } from "@/components/panels/AuditDrawer";
import { useMeshRealtime } from "@/hooks/useMeshRealtime";
import { subgraphConfigured } from "@/lib/subgraph";
import { operatorCounts, statusCounts, useMeshStore } from "@/store/mesh";

export function Console() {
  useMeshRealtime();

  const nodes = useMeshStore((s) => s.nodes);
  const link = useMeshStore((s) => s.link);
  const linkError = useMeshStore((s) => s.linkError);
  const events = useMeshStore((s) => s.events);

  const counts = useMemo(() => statusCounts(nodes), [nodes]);
  const ops = useMemo(() => operatorCounts(nodes), [nodes]);

  return (
    <div className="flex h-screen flex-col bg-void">
      <TopBar
        link={link}
        linkDetail={linkError ?? undefined}
        statusCounts={counts}
        operatorCounts={ops}
        subgraphState={subgraphConfigured ? "live" : "idle"}
      />

      <main className="grid min-h-0 flex-1 gap-2 p-2 grid-cols-[minmax(320px,22vw)_1fr_minmax(360px,24vw)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Panel label="reasoning trace" className="flex-[8]">
            <TracePanel />
          </Panel>
          <Panel
            label="event log"
            className="flex-[4]"
            accessory={
              <span className="data text-[10px] text-ink-faint">
                {events.length}
              </span>
            }
          >
            <EventLog />
          </Panel>
        </div>

        <Panel label="mesh" scroll={false}>
          <MeshViewport />
        </Panel>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel label="node inspector" className="flex-[6]">
            <NodeInspector />
          </Panel>
          <Panel label="the graph · indexed history" className="flex-[6]" scroll={false}>
            <GraphPanel />
          </Panel>
        </div>
      </main>

      <AuditDrawer />
      <FreezeModal />
    </div>
  );
}
