import type { NodeStatus } from "@verimesh/shared";

export const NEUTRAL = {
  text: "#ededf0",
  dim: "#a1a1a8",
  faint: "#6e6e76",
  line: "#26262a",
  lineBright: "#35353b",
  panel: "#131315",
  raised: "#18181b",
} as const;

export const ACCENT = "#5b8cff";

export interface Swatch {
  label: string;
  hex: string;
}

export const OPERATOR_COLORS: Record<string, Swatch> = {
  opA: { label: "Operator A", hex: "#8fa6cc" },
  opB: { label: "Operator B", hex: "#ccab8f" },
  opC: { label: "Operator C", hex: "#ab9acc" },
};

export const OPERATOR_FALLBACK: Swatch = { label: "unknown", hex: "#8a8a92" };

export function operatorSwatch(operator: string | undefined): Swatch {
  if (!operator) return OPERATOR_FALLBACK;
  return OPERATOR_COLORS[operator] ?? OPERATOR_FALLBACK;
}

export type Severity = "none" | "info" | "notice" | "warn" | "danger";

export interface StatusToken {
  label: string;
  hex: string;
  glyph: string;
  severity: Severity;
}

export const STATUS_TOKENS: Record<NodeStatus, StatusToken> = {
  healthy: {
    label: "Healthy",
    hex: NEUTRAL.dim,
    glyph: "○",
    severity: "none",
  },
  warning: {
    label: "Warning",
    hex: "#c9a13f",
    glyph: "△",
    severity: "warn",
  },
  violation: {
    label: "Violation",
    hex: "#d1524f",
    glyph: "▲",
    severity: "danger",
  },
  awaiting_human: {
    label: "Awaiting human",
    hex: ACCENT,
    glyph: "❚❚",
    severity: "notice",
  },
  isolated: {
    label: "Isolated",
    hex: "#8a8a92",
    glyph: "⊘",
    severity: "info",
  },
  offline: {
    label: "Offline",
    hex: "#5c5c63",
    glyph: "·",
    severity: "none",
  },
};

export const STATUS_ORDER: NodeStatus[] = [
  "healthy",
  "warning",
  "violation",
  "awaiting_human",
  "isolated",
  "offline",
];

const OFFLINE = STATUS_TOKENS.offline;

export function statusToken(status: string | undefined): StatusToken {
  if (!status) return OFFLINE;
  return STATUS_TOKENS[status as NodeStatus] ?? OFFLINE;
}

export const STATUS_COLORS = STATUS_TOKENS;
export const statusSwatch = statusToken;

export const TIER_TOKENS: Record<string, StatusToken> = {
  T0_AUTONOMOUS: {
    label: "T0 · autonomous",
    hex: NEUTRAL.dim,
    glyph: "○",
    severity: "none",
  },
  T1_SINGLE: {
    label: "T1 · single human",
    hex: "#c9a13f",
    glyph: "◑",
    severity: "warn",
  },
  T2_QUORUM: {
    label: "T2 · cross-operator quorum",
    hex: ACCENT,
    glyph: "◉",
    severity: "notice",
  },
};

export function tierSwatch(tier: string | undefined): StatusToken {
  if (!tier) {
    return { label: "Unknown tier", hex: NEUTRAL.faint, glyph: "○", severity: "none" };
  }
  return (
    TIER_TOKENS[tier] ?? {
      label: tier,
      hex: NEUTRAL.faint,
      glyph: "○",
      severity: "none",
    }
  );
}

export const VERDICT_TOKENS: Record<string, StatusToken> = {
  VERIFIED: {
    label: "Verified",
    hex: NEUTRAL.dim,
    glyph: "✓",
    severity: "none",
  },
  VIOLATION_TRIGGERED: {
    label: "Violation",
    hex: "#d1524f",
    glyph: "▲",
    severity: "danger",
  },
  ESCALATE: {
    label: "Escalate",
    hex: "#c9a13f",
    glyph: "△",
    severity: "warn",
  },
};

export function verdictSwatch(verdict: string | undefined): StatusToken {
  if (!verdict) {
    return { label: "—", hex: NEUTRAL.faint, glyph: "·", severity: "none" };
  }
  return (
    VERDICT_TOKENS[verdict] ?? {
      label: verdict,
      hex: NEUTRAL.dim,
      glyph: "·",
      severity: "none",
    }
  );
}

const EVENT_SEVERITY: { token: string; severity: Severity }[] = [
  { token: "error", severity: "danger" },
  { token: "violation", severity: "danger" },
  { token: "freeze", severity: "notice" },
  { token: "approval", severity: "notice" },
  { token: "override", severity: "notice" },
  { token: "anomaly", severity: "warn" },
  { token: "detect", severity: "warn" },
  { token: "escalate", severity: "warn" },
  { token: "rehearsal", severity: "warn" },
  { token: "scenario", severity: "warn" },
  { token: "reset", severity: "info" },
  { token: "commit", severity: "info" },
  { token: "chain", severity: "info" },
  { token: "storage", severity: "info" },
  { token: "history", severity: "info" },
];

export const SEVERITY_COLORS: Record<Severity, string> = {
  none: NEUTRAL.faint,
  info: NEUTRAL.dim,
  notice: ACCENT,
  warn: "#c9a13f",
  danger: "#d1524f",
};

export function eventSeverity(type: string | undefined): Severity {
  if (!type) return "none";
  const key = type.toLowerCase();
  for (const entry of EVENT_SEVERITY) {
    if (key.includes(entry.token)) return entry.severity;
  }
  return "none";
}

export function eventColor(type: string | undefined): string {
  return SEVERITY_COLORS[eventSeverity(type)];
}

export function cssVariables(): string {
  const lines: string[] = [`--accent: ${ACCENT};`];
  for (const [id, swatch] of Object.entries(OPERATOR_COLORS)) {
    lines.push(`--${id.toLowerCase()}: ${swatch.hex};`);
  }
  for (const [id, token] of Object.entries(STATUS_TOKENS)) {
    lines.push(`--status-${id.replace(/_/g, "-")}: ${token.hex};`);
  }
  return `:root{${lines.join("")}}`;
}
