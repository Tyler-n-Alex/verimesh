"use client";

import type { ReactNode } from "react";

export function Panel({
  label,
  accessory,
  children,
  className = "",
  bodyClassName = "",
  scroll = true,
}: {
  label: string;
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
}) {
  return (
    <section
      className={`surface flex min-h-0 flex-col overflow-hidden rounded-md ${className}`}
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-panel-raised px-3">
        <span className="panel-label truncate">{label}</span>
        {accessory ? (
          <div className="flex shrink-0 items-center gap-1.5">{accessory}</div>
        ) : null}
      </header>
      <div
        className={`min-h-0 flex-1 ${scroll ? "scroll-thin overflow-y-auto" : "overflow-hidden"} ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  tone = "neutral",
}: {
  title: string;
  hint?: string;
  tone?: "neutral" | "error" | "waiting";
}) {
  const toneColor =
    tone === "error" ? "#f43f5e" : tone === "waiting" ? "#22d3ee" : "#5b6880";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: toneColor,
          boxShadow: `0 0 12px ${toneColor}`,
        }}
      />
      <p className="data text-[12px] tracking-wide text-ink-dim">{title}</p>
      {hint ? (
        <p className="max-w-[26ch] text-[11px] leading-relaxed text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-px p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="relative h-7 overflow-hidden rounded bg-hairline/40"
        >
          <div className="animate-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-hairline-bright/60 to-transparent" />
        </div>
      ))}
    </div>
  );
}
