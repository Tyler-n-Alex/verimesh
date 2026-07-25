"use client";

import { Html } from "@react-three/drei";
import { useMeshStore } from "@/store/mesh";
import { operatorSwatch, statusSwatch } from "@/lib/palette";
import { worldPos } from "@/lib/layout";

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

  if (!position) return null;

  const [x, y, z] = position.split(",").map(Number);
  const op = operatorSwatch(operator);
  const st = statusSwatch(status);
  const expanded = selected || status !== "healthy";

  return (
    <Html
      position={[x, y + 0.72, z]}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div className="flex flex-col items-center gap-0.5 whitespace-nowrap">
        <span
          className="data rounded-sm border px-1.5 py-0.5 text-[11px] leading-none font-semibold tracking-wide"
          style={{
            color: op.hex,
            borderColor: `${op.hex}66`,
            background: "rgba(5,7,13,0.82)",
            boxShadow: selected ? `0 0 12px ${op.hex}88` : "none",
          }}
        >
          {name}
        </span>
        {expanded ? (
          <span
            className="data rounded-sm px-1.5 py-0.5 text-[10px] leading-none tracking-wide"
            style={{
              color: st.hex,
              background: "rgba(5,7,13,0.9)",
              border: `1px solid ${st.hex}55`,
            }}
          >
            {status === "awaiting_human" ? "AWAITING HUMAN" : status.toUpperCase()}
            <span className="ml-1.5 text-ink-faint">
              {load}% · {temp}°
            </span>
          </span>
        ) : null}
      </div>
    </Html>
  );
}
