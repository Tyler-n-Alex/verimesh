"use client";

import { useMemo } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { Panel } from "@/components/ui/Panel";
import { MeshViewport } from "@/components/mesh/MeshViewport";
import { MeshLegend } from "@/components/mesh/MeshLegend";
import { TracePanel } from "@/components/panels/TracePanel";
import { EventLog } from "@/components/panels/EventLog";
import { NodeInspector } from "@/components/panels/NodeInspector";
import { GraphPanel } from "@/components/panels/GraphPanel";
import { FreezeModal } from "@/components/panels/FreezeModal";
import { AuditDrawer } from "@/components/panels/AuditDrawer";
import { useMeshRealtime } from "@/hooks/useMeshRealtime";
import { subgraphConfigured } from "@/lib/subgraph";
import { operatorCounts, statusCounts, useMeshStore } from "@/store/mesh";
import { useSubgraphHealth } from "@/store/subgraph";

export function Console() {
  useMeshRealtime();

  const nodes = useMeshStore((s) => s.nodes);
  const link = useMeshStore((s) => s.link);
  const linkError = useMeshStore((s) => s.linkError);
  const events = useMeshStore((s) => s.events);

  const counts = useMemo(() => statusCounts(nodes), [nodes]);
  const ops = useMemo(() => operatorCounts(nodes), [nodes]);

  const graphSource = useSubgraphHealth((s) => s.source);
  const graphError = useSubgraphHealth((s) => s.error);
  const graphEndpoint = useSubgraphHealth((s) => s.endpoint);

  const subgraphState =
    graphSource === "live"
      ? "live"
      : graphSource === "fixture"
        ? graphError
          ? "error"
          : "idle"
        : subgraphConfigured
          ? "connecting"
          : "idle";

  const subgraphDetail = graphError
    ? `${graphEndpoint} — ${graphError}`
    : graphSource === "fixture"
      ? "SUBGRAPH_URL is not set — every Graph view is running on a fixture shaped like schema.graphql"
      : undefined;

  return (
    <>
      <div id="verimesh-console" className="flex flex-col bg-void">
        <TopBar
          link={link}
          linkDetail={linkError ?? undefined}
          statusCounts={counts}
          operatorCounts={ops}
          subgraphState={subgraphState}
          subgraphDetail={subgraphDetail}
        />

        <main className="grid min-h-0 flex-1 grid-cols-[minmax(340px,23vw)_1fr_minmax(380px,25vw)] gap-3 p-3">
          <div className="flex min-h-0 flex-col gap-3">
            <Panel label="Reasoning trace" className="flex-[8]">
              <TracePanel />
            </Panel>
            <Panel
              label="Event log"
              className="flex-[4]"
              accessory={
                <span className="num text-[12px] text-ink-faint">
                  {events.length}
                </span>
              }
            >
              <EventLog />
            </Panel>
          </div>

          <Panel label="Mesh" scroll={false} accessory={<MeshLegend />}>
            <MeshViewport />
          </Panel>

          <div className="flex min-h-0 flex-col gap-3">
            <Panel label="Node inspector" className="flex-[6]">
              <NodeInspector />
            </Panel>
            <Panel label="Indexed history" className="flex-[6]" scroll={false}>
              <GraphPanel />
            </Panel>
          </div>
        </main>
      </div>

      <AuditDrawer />
      <FreezeModal />
    </>
  );
}
