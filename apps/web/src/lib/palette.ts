import type { NodeStatus } from "@verimesh/shared";

export interface Swatch {
  label: string;
  hex: string;
}

export const OPERATOR_COLORS: Record<string, Swatch> = {
  opA: { label: "Operator A", hex: "#38bdf8" },
  opB: { label: "Operator B", hex: "#fb923c" },
  opC: { label: "Operator C", hex: "#c084fc" },
};

export const OPERATOR_FALLBACK: Swatch = { label: "unknown", hex: "#64748b" };

export function operatorSwatch(operator: string | undefined): Swatch {
  if (!operator) return OPERATOR_FALLBACK;
  return OPERATOR_COLORS[operator] ?? OPERATOR_FALLBACK;
}

export const STATUS_COLORS: Record<NodeStatus, Swatch> = {
  healthy: { label: "healthy", hex: "#34d399" },
  warning: { label: "warning", hex: "#fbbf24" },
  violation: { label: "violation", hex: "#f43f5e" },
  awaiting_human: { label: "awaiting human", hex: "#e879f9" },
  isolated: { label: "isolated", hex: "#94a3b8" },
  offline: { label: "offline", hex: "#475569" },
};

export const STATUS_ORDER: NodeStatus[] = [
  "healthy",
  "warning",
  "violation",
  "awaiting_human",
  "isolated",
  "offline",
];

export function statusSwatch(status: string | undefined): Swatch {
  if (!status) return STATUS_COLORS.offline;
  return STATUS_COLORS[status as NodeStatus] ?? STATUS_COLORS.offline;
}

export const TIER_COLORS: Record<string, Swatch> = {
  T0_AUTONOMOUS: { label: "T0 · autonomous", hex: "#34d399" },
  T1_SINGLE: { label: "T1 · single human", hex: "#fbbf24" },
  T2_QUORUM: { label: "T2 · cross-operator quorum", hex: "#e879f9" },
};

export function tierSwatch(tier: string | undefined): Swatch {
  if (!tier) return { label: "unknown tier", hex: "#64748b" };
  return TIER_COLORS[tier] ?? { label: tier, hex: "#64748b" };
}

export const VERDICT_COLORS: Record<string, Swatch> = {
  VERIFIED: { label: "VERIFIED", hex: "#34d399" },
  VIOLATION_TRIGGERED: { label: "VIOLATION", hex: "#f43f5e" },
  ESCALATE: { label: "ESCALATE", hex: "#fbbf24" },
};

export function verdictSwatch(verdict: string | undefined): Swatch {
  if (!verdict) return { label: "—", hex: "#64748b" };
  return VERDICT_COLORS[verdict] ?? { label: verdict, hex: "#94a3b8" };
}

export const EVENT_COLORS: Record<string, string> = {
  seed: "#64748b",
  telemetry: "#38bdf8",
  anomaly: "#fbbf24",
  detect: "#fbbf24",
  history: "#c084fc",
  proposal: "#a5b4fc",
  verdict: "#34d399",
  violation: "#f43f5e",
  freeze: "#e879f9",
  approval: "#e879f9",
  override: "#e879f9",
  commit: "#34d399",
  chain: "#22d3ee",
  storage: "#22d3ee",
  error: "#f43f5e",
};

export function eventColor(type: string | undefined): string {
  if (!type) return "#94a3b8";
  const key = type.toLowerCase();
  for (const token of Object.keys(EVENT_COLORS)) {
    if (key.includes(token)) return EVENT_COLORS[token];
  }
  return "#94a3b8";
}

export function cssVariables(): string {
  const lines: string[] = [];
  for (const [id, swatch] of Object.entries(OPERATOR_COLORS)) {
    lines.push(`--${id.toLowerCase()}: ${swatch.hex};`);
  }
  for (const [id, swatch] of Object.entries(STATUS_COLORS)) {
    lines.push(`--status-${id.replace(/_/g, "-")}: ${swatch.hex};`);
  }
  return `:root{${lines.join("")}}`;
}
