"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { EmptyState } from "@/components/ui/Panel";
import { NodeList } from "@/components/panels/NodeList";
import { useMeshStore } from "@/store/mesh";
import { usePerfStore } from "@/store/perf";

const MeshScene = dynamic(
  () => import("@/components/mesh/MeshScene").then((m) => m.MeshScene),
  {
    ssr: false,
    loading: () => (
      <EmptyState tone="waiting" title="initialising renderer" />
    ),
  }
);

export function MeshViewport() {
  const hydrated = useMeshStore((s) => s.hydrated);
  const link = useMeshStore((s) => s.link);
  const linkError = useMeshStore((s) => s.linkError);
  const nodeCount = useMeshStore((s) => s.nodeIds.length);
  const [rosterOpen, setRosterOpen] = useState(false);

  if (link === "error" && !hydrated) {
    return (
      <div className="grid-floor h-full">
        <EmptyState
          tone="error"
          title="mesh unreachable"
          hint={linkError ?? "Supabase did not answer."}
        />
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="grid-floor h-full">
        <EmptyState tone="waiting" title="subscribing to the mesh" />
      </div>
    );
  }

  if (nodeCount === 0) {
    return (
      <div className="grid-floor h-full">
        <EmptyState
          title="no nodes seeded"
          hint="Run `pnpm --filter @verimesh/agent seed` to populate the mesh."
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MeshScene />

      <PerfHud />

      <button
        type="button"
        onClick={() => setRosterOpen((v) => !v)}
        className="panel-label absolute top-2 right-2 z-20 rounded-sm border border-hairline bg-panel/90 px-2 py-1 text-[10px] transition-colors hover:border-hairline-bright hover:text-ink"
      >
        {rosterOpen ? "hide roster" : "roster"}
      </button>

      {rosterOpen ? (
        <div className="surface scroll-thin absolute top-10 right-2 z-20 max-h-[calc(100%-3rem)] w-[380px] overflow-y-auto rounded-md shadow-2xl">
          <NodeList />
        </div>
      ) : null}
    </div>
  );
}

function PerfHud() {
  const fps = usePerfStore((s) => s.fps);
  const worst = usePerfStore((s) => s.worst);
  const calls = usePerfStore((s) => s.calls);

  const tone = fps >= 55 ? "#34d399" : fps >= 40 ? "#fbbf24" : "#f43f5e";

  return (
    <div className="data absolute bottom-2 right-2 z-20 flex items-center gap-2 rounded-sm border border-hairline bg-void/80 px-2 py-1 text-[10px] text-ink-faint">
      <span style={{ color: tone }}>{fps} fps</span>
      <span>min {worst === 999 ? "—" : worst}</span>
      <span>{calls} calls</span>
    </div>
  );
}
