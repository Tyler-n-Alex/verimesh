"use client";

import { Pill } from "@/components/ui/Pill";
import { ProjectorToggle } from "@/components/shell/ProjectorToggle";
import { STATUS_COLORS, OPERATOR_COLORS } from "@/lib/palette";
import type { NodeStatus } from "@verimesh/shared";

export type LinkState = "connecting" | "live" | "error" | "idle";

const LINK_TONE: Record<LinkState, string> = {
  connecting: "#fbbf24",
  live: "#34d399",
  error: "#f43f5e",
  idle: "#5b6880",
};

export function TopBar({
  link,
  linkDetail,
  statusCounts,
  operatorCounts,
  subgraphState,
}: {
  link: LinkState;
  linkDetail?: string;
  statusCounts: Partial<Record<NodeStatus, number>>;
  operatorCounts: Record<string, number>;
  subgraphState: LinkState;
}) {
  const notable: NodeStatus[] = [
    "violation",
    "awaiting_human",
    "warning",
    "isolated",
    "offline",
  ];
  const flagged = notable.filter((s) => (statusCounts[s] ?? 0) > 0);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline bg-abyss px-4">
      <div className="flex items-baseline gap-2.5">
        <span
          className="text-[19px] leading-none font-bold tracking-[0.22em]"
          style={{ color: "var(--color-ink)" }}
        >
          VERIMESH
        </span>
        <span className="panel-label hidden text-[10px] lg:inline">
          verifiable autonomy · DePIN
        </span>
      </div>

      <div className="h-6 w-px bg-hairline" />

      <div className="flex items-center gap-1.5">
        <Pill
          color={LINK_TONE[link]}
          pulse={link === "connecting"}
          title={linkDetail}
        >
          supabase {link}
        </Pill>
        <Pill color={LINK_TONE[subgraphState]} pulse={subgraphState === "connecting"}>
          subgraph {subgraphState}
        </Pill>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {Object.entries(OPERATOR_COLORS).map(([id, swatch]) => (
          <Pill key={id} color={swatch.hex} title={swatch.label}>
            {id} {operatorCounts[id] ?? 0}
          </Pill>
        ))}
      </div>

      <div className="h-6 w-px bg-hairline" />

      <div className="flex items-center gap-1.5">
        <Pill color={STATUS_COLORS.healthy.hex}>
          healthy {statusCounts.healthy ?? 0}
        </Pill>
        {flagged.map((s) => (
          <Pill
            key={s}
            color={STATUS_COLORS[s].hex}
            pulse={s === "violation" || s === "awaiting_human"}
          >
            {STATUS_COLORS[s].label} {statusCounts[s]}
          </Pill>
        ))}
      </div>

      <div className="h-6 w-px bg-hairline" />

      <ProjectorToggle />
    </header>
  );
}
