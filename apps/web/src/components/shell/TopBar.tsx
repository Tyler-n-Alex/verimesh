"use client";

import { ProjectorToggle } from "@/components/shell/ProjectorToggle";
import { NEUTRAL, STATUS_TOKENS } from "@/lib/palette";
import type { NodeStatus } from "@verimesh/shared";

export type LinkState = "connecting" | "live" | "error" | "idle";

const LINK_LABEL: Record<LinkState, string> = {
  connecting: "Connecting",
  live: "Connected",
  error: "Unreachable",
  idle: "Fixture",
};

const NOTABLE: NodeStatus[] = [
  "violation",
  "awaiting_human",
  "warning",
  "isolated",
  "offline",
];

export function TopBar({
  link,
  linkDetail,
  statusCounts,
  operatorCounts,
  subgraphState,
  subgraphDetail,
}: {
  link: LinkState;
  linkDetail?: string;
  statusCounts: Partial<Record<NodeStatus, number>>;
  operatorCounts: Record<string, number>;
  subgraphState: LinkState;
  subgraphDetail?: string;
}) {
  const flagged = NOTABLE.filter((s) => (statusCounts[s] ?? 0) > 0);
  const total = Object.values(operatorCounts).reduce((a, b) => a + b, 0);
  const healthy = statusCounts.healthy ?? 0;

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-hairline bg-abyss px-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[15px] leading-none font-semibold tracking-tight text-ink">
          Verimesh
        </span>
        <span className="hidden text-[12px] text-ink-faint lg:inline">
          Verifiable autonomy for DePIN
        </span>
      </div>

      <div className="h-5 w-px bg-hairline" />

      <div className="flex items-center gap-4">
        <Connection state={link} label="Supabase" detail={linkDetail} />
        <Connection
          state={subgraphState}
          label="Subgraph"
          detail={subgraphDetail}
        />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <span className="num text-[12.5px] text-ink-dim">
          {total} nodes
          <span className="ml-1.5 text-ink-faint">
            {healthy} healthy
          </span>
        </span>

        {flagged.length > 0 ? (
          <>
            <div className="h-5 w-px bg-hairline" />
            <div className="flex items-center gap-3">
              {flagged.map((status) => {
                const token = STATUS_TOKENS[status];
                const urgent =
                  token.severity === "danger" || token.severity === "notice";
                return (
                  <span
                    key={status}
                    className="flex items-center gap-1.5 whitespace-nowrap"
                    style={{
                      color: urgent ? token.hex : NEUTRAL.dim,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={`text-[11px] leading-none ${urgent ? "animate-attention" : ""}`}
                    >
                      {token.glyph}
                    </span>
                    <span className="num text-[12.5px]">
                      {statusCounts[status]} {token.label.toLowerCase()}
                    </span>
                  </span>
                );
              })}
            </div>
          </>
        ) : null}

        <div className="h-5 w-px bg-hairline" />
        <ProjectorToggle />
      </div>
    </header>
  );
}

function Connection({
  state,
  label,
  detail,
}: {
  state: LinkState;
  label: string;
  detail?: string;
}) {
  const bad = state === "error";
  const idle = state === "idle";
  const good = state === "live";
  const tone = bad ? "#d1524f" : idle ? "#c9a13f" : NEUTRAL.faint;

  return (
    <span
      className="flex items-center gap-2 whitespace-nowrap"
      title={detail ?? `${label} ${LINK_LABEL[state].toLowerCase()}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${state === "connecting" ? "animate-attention" : ""}`}
        style={{
          background: bad
            ? "#d1524f"
            : idle
              ? "#c9a13f"
              : good
                ? NEUTRAL.dim
                : NEUTRAL.lineBright,
        }}
      />
      <span className="text-[12.5px] text-ink-dim">{label}</span>
      <span className="text-[12.5px]" style={{ color: tone }}>
        {LINK_LABEL[state]}
      </span>
    </span>
  );
}
