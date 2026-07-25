"use client";

import { useMemo, useState } from "react";
import { ACTIONS, blueprint, type Action } from "@verimesh/shared";
import { EmptyState } from "@/components/ui/Panel";
import { Metric, Pill } from "@/components/ui/Pill";
import { Sparkline } from "@/components/ui/Sparkline";
import { clock, num, pct } from "@/lib/format";
import { operatorSwatch, statusSwatch } from "@/lib/palette";
import { useMeshStore } from "@/store/mesh";

interface Bounds {
  T_warn: number;
  T_max: number;
  L_max: number;
  X_nominal: number;
}

const BOUNDS = new Map<string, Bounds>(
  (blueprint as { nodes: (Bounds & { id: string })[] }).nodes.map((n) => [
    n.id,
    { T_warn: n.T_warn, T_max: n.T_max, L_max: n.L_max, X_nominal: n.X_nominal },
  ])
);

export function NodeInspector() {
  const selectedNodeId = useMeshStore((s) => s.selectedNodeId);
  const node = useMeshStore((s) =>
    s.selectedNodeId ? s.nodes[s.selectedNodeId] : undefined
  );
  const series = useMeshStore((s) =>
    s.selectedNodeId ? s.telemetry[s.selectedNodeId] : undefined
  );
  const edges = useMeshStore((s) => s.edges);
  const nodes = useMeshStore((s) => s.nodes);
  const selectNode = useMeshStore((s) => s.selectNode);

  const neighbours = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((e) => e.from === selectedNodeId || e.to === selectedNodeId)
      .map((e) => {
        const otherId = e.from === selectedNodeId ? e.to : e.from;
        return { id: otherId, node: nodes[otherId], cross: e.crossOperator };
      })
      .filter((n) => Boolean(n.node));
  }, [edges, nodes, selectedNodeId]);

  if (!selectedNodeId || !node) {
    return (
      <EmptyState
        title="no node selected"
        hint="Click a node in the mesh, or a row in the roster."
      />
    );
  }

  const op = operatorSwatch(node.operator);
  const st = statusSwatch(node.status);
  const bounds = BOUNDS.get(node.id);
  const points = series ?? [];
  const temps = points.map((p) => p.temp);
  const loads = points.map((p) => p.load * 100);
  const throughputs = points.map((p) => p.throughput);

  const tempTone =
    bounds && node.metrics.temp >= bounds.T_max
      ? "#f43f5e"
      : bounds && node.metrics.temp >= bounds.T_warn
        ? "#fbbf24"
        : undefined;
  const loadTone =
    bounds && node.metrics.load >= bounds.L_max ? "#f43f5e" : undefined;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-hairline bg-abyss px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="data text-[16px] leading-none font-bold text-ink">
            {node.name}
          </span>
          <button
            type="button"
            onClick={() => selectNode(null)}
            className="data text-[11px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            clear
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill color={op.hex} title={op.label}>
            {node.operator}
          </Pill>
          <Pill
            color={st.hex}
            pulse={node.status === "violation" || node.status === "awaiting_human"}
          >
            {st.label}
          </Pill>
          <span className="data text-[10px] text-ink-faint">{node.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 py-2.5">
        <Metric label="load" value={pct(node.metrics.load)} tone={loadTone} />
        <Metric
          label="temp"
          value={num(node.metrics.temp)}
          unit="°C"
          tone={tempTone}
        />
        <Metric label="throughput" value={Math.round(node.metrics.throughput)} unit="r/s" />
        <Metric label="power" value={Math.round(node.metrics.power)} unit="W" />
        <Metric label="memory" value={pct(node.metrics.mem)} />
        <Metric label="fan" value={Math.round(node.metrics.fanRpm)} unit="rpm" />
      </div>

      <div className="flex flex-col gap-2.5 border-t border-hairline px-3 py-2.5">
        <SeriesRow
          label="temperature"
          values={temps}
          color={tempTone ?? "#22d3ee"}
          bound={bounds?.T_max}
          boundLabel={bounds ? `T_max ${bounds.T_max}` : undefined}
          latest={`${num(node.metrics.temp)}°C`}
        />
        <SeriesRow
          label="load"
          values={loads}
          color={loadTone ?? "#34d399"}
          bound={bounds ? bounds.L_max * 100 : undefined}
          boundLabel={bounds ? `L_max ${Math.round(bounds.L_max * 100)}%` : undefined}
          latest={pct(node.metrics.load)}
        />
        <SeriesRow
          label="throughput"
          values={throughputs}
          color="#a5b4fc"
          latest={`${Math.round(node.metrics.throughput)} r/s`}
        />
        <span className="data text-[10px] text-ink-faint">
          {points.length} sample{points.length === 1 ? "" : "s"} · last{" "}
          {clock(node.metrics.ts || node.updatedAt)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-hairline px-3 py-2.5">
        <span className="panel-label text-[9px]">
          neighbours ({neighbours.length})
        </span>
        <div className="flex flex-wrap gap-1.5">
          {neighbours.map((n) => {
            const nop = operatorSwatch(n.node!.operator);
            const nst = statusSwatch(n.node!.status);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => selectNode(n.id)}
                title={
                  n.cross
                    ? `cross-operator link — ${node.operator} → ${n.node!.operator}`
                    : `same-operator link`
                }
                className="data flex items-center gap-1.5 rounded-sm border px-1.5 py-1 text-[11px] transition-colors hover:border-hairline-bright"
                style={{
                  borderColor: n.cross ? `${nop.hex}88` : "#1c2436",
                  background: n.cross ? `${nop.hex}12` : "transparent",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: nst.hex }}
                />
                <span style={{ color: nop.hex }}>{n.node!.name}</span>
                {n.cross ? (
                  <span className="text-[9px] text-ink-faint">↔</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <ActionMenu nodeId={node.id} nodeName={node.name} />
    </div>
  );
}

function SeriesRow({
  label,
  values,
  color,
  bound,
  boundLabel,
  latest,
}: {
  label: string;
  values: number[];
  color: string;
  bound?: number;
  boundLabel?: string;
  latest: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between">
        <span className="panel-label text-[9px]">{label}</span>
        <span className="data text-[11px]" style={{ color }}>
          {latest}
        </span>
      </div>
      <Sparkline
        values={values}
        color={color}
        bound={bound}
        boundLabel={boundLabel}
      />
    </div>
  );
}

type Phase = "idle" | "sending" | "ok" | "error";

function ActionMenu({
  nodeId,
  nodeName,
}: {
  nodeId: string;
  nodeName: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const openGate = useMeshStore((s) => s.openGate);

  async function trigger(action: Action) {
    setPhase("sending");
    setPending(action);
    setDetail(null);
    try {
      const res = await fetch("/api/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, nodeId }),
      });
      const body = (await res.json()) as {
        error?: string;
        gateId?: number | null;
        requirement?: { tier: string; reason: string };
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setPhase("ok");
      setDetail(
        `${body.requirement?.tier ?? "?"} — ${body.requirement?.reason ?? ""}`
      );
      if (body.gateId) openGate(body.gateId);
    } catch (err) {
      setPhase("error");
      setDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="panel-label text-[9px]">actions · rehearsal</span>
        <span className="data text-[9px] text-ink-faint">
          writes a marked rehearsal row
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={phase === "sending"}
            onClick={() => trigger(action)}
            className="data rounded-sm border border-hairline bg-abyss px-2 py-1.5 text-left text-[10.5px] tracking-wide text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink disabled:opacity-40"
          >
            {pending === action ? "…" : action}
          </button>
        ))}
      </div>

      {detail ? (
        <p
          className="text-[11px] leading-snug"
          style={{ color: phase === "error" ? "#f43f5e" : "#34d399" }}
        >
          {phase === "error" ? "failed: " : `${nodeName}: `}
          {detail}
        </p>
      ) : null}
    </div>
  );
}
