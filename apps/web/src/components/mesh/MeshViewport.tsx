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
    loading: () => <EmptyState tone="waiting" title="Initialising renderer…" />,
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
      <EmptyState
        tone="error"
        title="Mesh unreachable"
        hint={linkError ?? "Supabase did not answer."}
      />
    );
  }

  if (!hydrated) {
    return <EmptyState tone="waiting" title="Subscribing to the mesh…" />;
  }

  if (nodeCount === 0) {
    return (
      <EmptyState
        title="No nodes seeded"
        hint="Run pnpm --filter @verimesh/agent seed to populate the mesh."
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <MeshScene />

      <PerfHud />

      <button
        type="button"
        onClick={() => setRosterOpen((v) => !v)}
        className="absolute top-3 right-3 z-20 rounded-md border border-hairline bg-panel/95 px-2.5 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
      >
        {rosterOpen ? "Hide roster" : "Roster"}
      </button>

      {rosterOpen ? (
        <div className="surface elevated scroll-thin absolute top-12 right-3 z-20 max-h-[calc(100%-4rem)] w-[400px] overflow-y-auto rounded-lg">
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

  const degraded = fps > 0 && fps < 45;

  return (
    <div
      className="num absolute bottom-3 right-3 z-20 flex items-center gap-2.5 rounded-md border border-hairline bg-panel/90 px-2.5 py-1.5 text-[11.5px]"
      style={{ color: degraded ? "#c9a13f" : "var(--color-ink-faint)" }}
      title="Frames per second, worst frame this session, and WebGL draw calls."
    >
      <span>{fps} fps</span>
      <span className="text-ink-faint">min {worst === 999 ? "—" : worst}</span>
      <span className="text-ink-faint">{calls} calls</span>
    </div>
  );
}
