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
      className={`surface flex min-h-0 flex-col overflow-hidden rounded-lg ${className}`}
    >
      <header className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-hairline px-3.5 py-2">
        <h2 className="text-[13px] leading-none font-medium whitespace-nowrap text-ink">
          {label}
        </h2>
        {accessory ? (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {accessory}
          </div>
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
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-8 py-12 text-center">
      <p
        className="text-[13px] leading-snug"
        style={{
          color: tone === "error" ? "#d1524f" : "var(--color-ink-dim)",
        }}
      >
        {title}
      </p>
      {hint ? (
        <p className="max-w-[34ch] text-[12px] leading-relaxed text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="relative h-6 overflow-hidden rounded bg-panel-raised"
        >
          <div className="animate-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-hairline to-transparent" />
        </div>
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-2.5 rounded-lg border border-hairline bg-abyss p-3 ${className}`}
    >
      <h3 className="text-[12px] leading-none font-medium text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}
