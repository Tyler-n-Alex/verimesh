"use client";

import type { ReactNode } from "react";

export function Pill({
  color,
  children,
  pulse = false,
  title,
  className = "",
}: {
  color: string;
  children: ReactNode;
  pulse?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`data inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] leading-none tracking-wide whitespace-nowrap ${className}`}
      style={{
        borderColor: `${color}55`,
        background: `${color}12`,
        color,
      }}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse-dot" : ""}`}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {children}
    </span>
  );
}

export function Dot({
  color,
  pulse = false,
  size = 8,
}: {
  color: string;
  pulse?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${pulse ? "animate-pulse-dot" : ""}`}
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 ${size} ${color}`,
      }}
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
    <div className="flex flex-col gap-0.5 rounded-sm border border-hairline bg-abyss px-2 py-1.5">
      <span className="panel-label text-[9px] tracking-[0.12em]">{label}</span>
      <span
        className="data text-[15px] leading-none font-semibold"
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-[10px] font-normal text-ink-faint">
            {unit}
          </span>
        ) : null}
      </span>
    </div>
  );
}
