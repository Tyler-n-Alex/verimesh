"use client";

import type { ReactNode } from "react";
import { NEUTRAL, statusToken, type Severity } from "@/lib/palette";

export function Badge({
  children,
  tone,
  severity = "none",
  glyph,
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: string;
  severity?: Severity;
  glyph?: string;
  title?: string;
  className?: string;
}) {
  const emphatic = severity === "danger" || severity === "notice";
  const color = tone ?? NEUTRAL.dim;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-[3px] text-[12px] leading-none whitespace-nowrap ${className}`}
      style={{
        borderColor: emphatic ? `${color}4d` : NEUTRAL.line,
        background: emphatic ? `${color}14` : "transparent",
        color: severity === "none" ? NEUTRAL.dim : color,
      }}
    >
      {glyph ? (
        <span aria-hidden="true" className="text-[10px] leading-none">
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}

export const Pill = Badge;

export function StatusTag({
  status,
  withLabel = true,
  attention = false,
}: {
  status: string;
  withLabel?: boolean;
  attention?: boolean;
}) {
  const token = statusToken(status);
  const urgent = token.severity === "danger" || token.severity === "notice";

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{ color: token.severity === "none" ? NEUTRAL.dim : token.hex }}
      title={token.label}
    >
      <span
        aria-hidden="true"
        className={`text-[11px] leading-none ${attention && urgent ? "animate-attention" : ""}`}
      >
        {token.glyph}
      </span>
      {withLabel ? (
        <span className="text-[12px] leading-none">{token.label}</span>
      ) : null}
    </span>
  );
}

export function OperatorTag({
  operator,
  muted = false,
}: {
  operator: string;
  muted?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-[2px] text-[11.5px] leading-none whitespace-nowrap"
      style={{
        borderColor: NEUTRAL.line,
        color: muted ? NEUTRAL.faint : NEUTRAL.dim,
      }}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-[2px]"
        style={{ background: `var(--${operator.toLowerCase()}, ${NEUTRAL.faint})` }}
      />
      {operator}
    </span>
  );
}

export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

export function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] leading-none text-ink-faint">{label}</span>
      <span
        className="num text-[17px] leading-none font-medium"
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-[11px] font-normal text-ink-faint">
            {unit}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function KeyValue({
  label,
  value,
  mono = false,
  tone,
  wrap = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: string;
  wrap?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11.5px] leading-none text-ink-faint">{label}</span>
      <span
        className={`text-[13px] leading-snug ${mono ? "data" : ""} ${wrap ? "break-all" : "truncate"}`}
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
      </span>
    </div>
  );
}
