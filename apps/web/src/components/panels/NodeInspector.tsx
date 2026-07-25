"use client";

import { useMemo, useState } from "react";
import { ACTIONS, blueprint, type Action } from "@verimesh/shared";
import { EmptyState } from "@/components/ui/Panel";
import { Metric, OperatorTag, StatusTag } from "@/components/ui/Pill";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { ago, clock, num, pct } from "@/lib/format";
import { NEUTRAL, statusToken } from "@/lib/palette";
import { DEVICE_BOUNDS, isDeviceStale } from "@/lib/device";
import { useNow } from "@/hooks/useNow";
import { useMeshStore } from "@/store/mesh";
import type { MeshNode } from "@/lib/db";

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
  const now = useNow(1000);

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
        title="No node selected"
        hint="Click a node in the mesh, or a row in the roster."
      />
    );
  }

  const isDevice = node.kind === "device";
  const bounds = isDevice ? DEVICE_BOUNDS : BOUNDS.get(node.id);
  const points = series ?? [];
  const token = statusToken(node.status);
  const stale = isDevice ? isDeviceStale(node.lastSeenAt, now) : false;

  const overTemp = bounds ? node.metrics.temp >= bounds.T_warn : false;
  const overLoad = bounds ? node.metrics.load >= bounds.L_max : false;
  const tempTone = overTemp ? token.hex : undefined;
  const loadTone = overLoad ? token.hex : undefined;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-hairline px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[16px] leading-none font-medium text-ink">
            {node.name}
          </h3>
          <button
            type="button"
            onClick={() => selectNode(null)}
            className="text-[12px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OperatorTag operator={node.operator} />
          <StatusTag status={node.status} attention />
          {isDevice ? (
            <LiveBadge label={node.deviceLabel ?? node.name} stale={stale} />
          ) : null}
          <span className="data text-[11.5px] text-ink-faint">{node.id}</span>
        </div>
      </div>

      {isDevice ? (
        <DevicePanel node={node} stale={stale} now={now} />
      ) : null}

      <div className="grid grid-cols-3 gap-x-4 gap-y-3.5 px-3.5 py-3">
        <Metric label="Load" value={pct(node.metrics.load)} tone={loadTone} />
        <Metric
          label="Temperature"
          value={num(node.metrics.temp)}
          unit="°C"
          tone={tempTone}
        />
        <Metric
          label="Throughput"
          value={Math.round(node.metrics.throughput)}
          unit="r/s"
        />
        <Metric label="Power" value={Math.round(node.metrics.power)} unit="W" />
        <Metric label="Memory" value={pct(node.metrics.mem)} />
        <Metric label="Fan" value={Math.round(node.metrics.fanRpm)} unit="rpm" />
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline px-3.5 py-3">
        <SeriesRow
          label="Temperature"
          values={points.map((p) => p.temp)}
          color={tempTone ?? NEUTRAL.dim}
          bound={bounds?.T_max}
          boundLabel={bounds ? `T_max ${bounds.T_max}` : undefined}
          latest={`${num(node.metrics.temp)} °C`}
        />
        <SeriesRow
          label="Load"
          values={points.map((p) => p.load * 100)}
          color={loadTone ?? NEUTRAL.dim}
          bound={bounds ? bounds.L_max * 100 : undefined}
          boundLabel={
            bounds ? `L_max ${Math.round(bounds.L_max * 100)}%` : undefined
          }
          latest={pct(node.metrics.load)}
        />
        <SeriesRow
          label="Throughput"
          values={points.map((p) => p.throughput)}
          color={NEUTRAL.dim}
          latest={`${Math.round(node.metrics.throughput)} r/s`}
        />
        <span className="num text-[11.5px] text-ink-faint">
          {points.length} sample{points.length === 1 ? "" : "s"} · last{" "}
          {clock(node.metrics.ts || node.updatedAt)}
        </span>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline px-3.5 py-3">
        <h4 className="text-[12px] font-medium text-ink-faint">
          Neighbours ({neighbours.length})
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {neighbours.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => selectNode(n.id)}
              title={
                n.cross
                  ? `Cross-operator link — ${node.operator} to ${n.node!.operator}`
                  : "Same-operator link"
              }
              className="flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
              style={{
                borderColor: n.cross ? NEUTRAL.lineBright : NEUTRAL.line,
              }}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-[2px]"
                style={{
                  background: `var(--${n.node!.operator.toLowerCase()}, ${NEUTRAL.faint})`,
                }}
              />
              {n.node!.name}
              {n.cross ? (
                <span className="text-[11px] text-ink-faint">↔</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <ActionMenu nodeId={node.id} nodeName={node.name} />
    </div>
  );
}

function DevicePanel({
  node,
  stale,
  now,
}: {
  node: MeshNode;
  stale: boolean;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-hairline bg-abyss px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-medium text-ink-faint">
          Physical device
        </h4>
        <span className="num text-[11.5px] text-ink-faint">
          {node.lastSeenAt
            ? `last report ${ago(node.lastSeenAt, now)} ago`
            : "no report yet"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
        <Metric
          label="Battery"
          value={node.device.battery !== null ? `${node.device.battery}` : "—"}
          unit={node.device.battery !== null ? "%" : undefined}
        />
        <Metric
          label="SoC temp"
          value={
            node.device.socTemp !== null && node.device.socTemp !== undefined
              ? num(node.device.socTemp)
              : "—"
          }
          unit={node.device.socTemp ? "°C" : undefined}
        />
        <Metric
          label="Charging"
          value={
            node.device.charging === null || node.device.charging === undefined
              ? "—"
              : node.device.charging
                ? "Yes"
                : "No"
          }
        />
      </div>

      <p className="text-[12px] leading-relaxed text-ink-faint">
        {stale ? (
          <>
            The handset has stopped reporting. The agent falls back to
            simulating this node, so a dropout degrades the demo rather than
            breaking it.
          </>
        ) : (
          <>
            Load is real CPU utilisation from <span className="data">/proc/stat</span>{" "}
            and temperature is the real battery sensor via{" "}
            <span className="data">termux-battery-status</span>. Throughput is a
            measured work rate, so thermal throttling shows up as a genuine
            drop. This handset has no fan, so fan speed reads —.
          </>
        )}
      </p>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-ink-faint">{label}</span>
        <span className="num text-[12px]" style={{ color }}>
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
    <div className="flex flex-col gap-2.5 border-t border-hairline px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-medium text-ink-faint">Actions</h4>
        <span className="text-[11.5px] text-ink-faint">
          Rehearsal — writes a marked row
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={phase === "sending"}
            onClick={() => trigger(action)}
            className="rounded border border-hairline px-2.5 py-1.5 text-left text-[12px] text-ink-dim transition-colors hover:border-hairline-bright hover:bg-panel-raised hover:text-ink disabled:opacity-40"
          >
            {pending === action ? "Working…" : action}
          </button>
        ))}
      </div>

      {detail ? (
        <p
          className="text-[12px] leading-relaxed"
          style={{
            color: phase === "error" ? "#d1524f" : "var(--color-ink-dim)",
          }}
        >
          {phase === "error" ? "Failed: " : `${nodeName}: `}
          {detail}
        </p>
      ) : null}
    </div>
  );
}
