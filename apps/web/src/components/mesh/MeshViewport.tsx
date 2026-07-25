"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { EmptyState } from "@/components/ui/Panel";
import { NodeList } from "@/components/panels/NodeList";
import { OPERATOR_COLORS, STATUS_COLORS, STATUS_ORDER } from "@/lib/palette";
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

      <Legend />
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

function Legend() {
  return (
    <div className="absolute bottom-2 left-2 z-20 flex flex-col gap-2 rounded-md border border-hairline bg-void/80 px-2.5 py-2 backdrop-blur-sm">
      <div className="flex flex-col gap-1">
        <span className="panel-label text-[9px]">operator · node fill</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(OPERATOR_COLORS).map(([id, swatch]) => (
            <span key={id} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: swatch.hex,
                  boxShadow: `0 0 8px ${swatch.hex}`,
                }}
              />
              <span className="data text-[11px]" style={{ color: swatch.hex }}>
                {id}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="h-px bg-hairline" />

      <div className="flex flex-col gap-1">
        <span className="panel-label text-[9px]">status · ring</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STATUS_ORDER.map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full border-2"
                style={{ borderColor: STATUS_COLORS[status].hex }}
              />
              <span className="data text-[10px] text-ink-dim">
                {STATUS_COLORS[status].label}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="h-px bg-hairline" />

      <div className="flex items-center gap-1.5">
        <span
          className="h-0.5 w-6"
          style={{
            background:
              "repeating-linear-gradient(90deg,#38bdf8 0 5px,transparent 5px 8px)",
          }}
        />
        <span className="data text-[10px] text-ink-dim">
          dashed + thick = cross-operator link
        </span>
      </div>
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
