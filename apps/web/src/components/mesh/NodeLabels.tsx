"use client";

import { Html } from "@react-three/drei";
import { useMeshStore } from "@/store/mesh";
import { NEUTRAL, statusToken } from "@/lib/palette";
import { nodeActivity } from "@/lib/trace";
import { worldPos } from "@/lib/layout";
import { isDeviceStale } from "@/lib/device";
import { useNow } from "@/hooks/useNow";
import { LiveBadge } from "@/components/ui/LiveBadge";

export function NodeLabels() {
  const nodeIds = useMeshStore((s) => s.nodeIds);
  return (
    <group>
      {nodeIds.map((id) => (
        <NodeLabel key={id} nodeId={id} />
      ))}
    </group>
  );
}

function NodeLabel({ nodeId }: { nodeId: string }) {
  const name = useMeshStore((s) => s.nodes[nodeId]?.name ?? nodeId);
  const operator = useMeshStore((s) => s.nodes[nodeId]?.operator ?? "");
  const status = useMeshStore((s) => s.nodes[nodeId]?.status ?? "offline");
  const selected = useMeshStore((s) => s.selectedNodeId === nodeId);
  const temp = useMeshStore((s) =>
    Math.round(s.nodes[nodeId]?.metrics.temp ?? 0)
  );
  const load = useMeshStore((s) =>
    Math.round((s.nodes[nodeId]?.metrics.load ?? 0) * 100)
  );
  const position = useMeshStore((s) => {
    const node = s.nodes[nodeId];
    return node ? worldPos(node).join(",") : null;
  });
  const isDevice = useMeshStore((s) => s.nodes[nodeId]?.kind === "device");
  const deviceLabel = useMeshStore(
    (s) => s.nodes[nodeId]?.deviceLabel ?? s.nodes[nodeId]?.name ?? nodeId
  );
  const lastSeenAt = useMeshStore((s) => s.nodes[nodeId]?.lastSeenAt ?? null);
  const activity = useMeshStore((s) => nodeActivity(s, nodeId));
  const now = useNow(isDevice ? 1000 : 60000);

  if (!position) return null;

  const [x, y, z] = position.split(",").map(Number);
  const token = statusToken(status);
  const detailed = selected || status !== "healthy" || activity !== null;
  const urgent =
    token.severity === "danger" ||
    token.severity === "notice" ||
    activity !== null;
  const stale = isDevice ? isDeviceStale(lastSeenAt, now) : false;

  return (
    <Html
      position={[x, y + 0.62, z]}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div className="flex flex-col items-center gap-1 whitespace-nowrap">
        {isDevice ? <LiveBadge label={deviceLabel} stale={stale} /> : null}
        <span
          className="flex items-center gap-1.5 rounded border px-1.5 py-[3px] text-[11.5px] leading-none"
          style={{
            borderColor: selected ? NEUTRAL.lineBright : NEUTRAL.line,
            background: "rgba(13,13,16,0.9)",
            color: selected ? NEUTRAL.text : NEUTRAL.dim,
          }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-[2px]"
            style={{ background: `var(--${operator.toLowerCase()}, ${NEUTRAL.faint})` }}
          />
          {name}
        </span>

        {detailed ? (
          <span
            className="flex items-center gap-1.5 rounded border px-1.5 py-[3px] text-[11px] leading-none"
            style={{
              borderColor: urgent ? `${token.hex}59` : NEUTRAL.line,
              background: "rgba(13,13,16,0.94)",
              color: token.severity === "none" ? NEUTRAL.dim : token.hex,
            }}
          >
            <span
              aria-hidden="true"
              className={`text-[10px] leading-none ${activity ? "animate-attention" : ""}`}
            >
              {activity ? "◴" : token.glyph}
            </span>
            {activity ?? token.label}
            <span className="num text-ink-faint">
              {load}% · {temp}°
            </span>
          </span>
        ) : null}
      </div>
    </Html>
  );
}
