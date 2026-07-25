"use client";

import { useMemo } from "react";

export function Sparkline({
  values,
  color,
  height = 36,
  width = 100,
  bound,
  boundLabel,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
  bound?: number;
  boundLabel?: string;
}) {
  const geometry = useMemo(() => {
    if (values.length < 2) return null;

    const candidates = bound === undefined ? values : [...values, bound];
    let min = Math.min(...candidates);
    let max = Math.max(...candidates);
    if (max - min < 1e-6) {
      max += 0.5;
      min -= 0.5;
    }
    const pad = (max - min) * 0.16;
    min -= pad;
    max += pad;

    const scaleY = (v: number) => height - ((v - min) / (max - min)) * height;
    const scaleX = (i: number) => (i / (values.length - 1)) * width;

    const line = values
      .map((v, i) => `${scaleX(i).toFixed(2)},${scaleY(v).toFixed(2)}`)
      .join(" ");

    return {
      line,
      area: `0,${height} ${line} ${width},${height}`,
      boundY: bound === undefined ? null : scaleY(bound),
      last: values[values.length - 1],
    };
  }, [values, height, width, bound]);

  if (!geometry) {
    return (
      <div
        className="flex items-center rounded border border-hairline bg-abyss px-2 text-[11px] text-ink-faint"
        style={{ height }}
      >
        Collecting samples…
      </div>
    );
  }

  const gradientId = `spark-${color.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={`Trend, latest ${geometry.last.toFixed(1)}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {geometry.boundY !== null ? (
        <g>
          <line
            x1="0"
            x2={width}
            y1={geometry.boundY}
            y2={geometry.boundY}
            stroke="#6e6e76"
            strokeWidth="0.7"
            strokeDasharray="2 3"
          />
          {boundLabel ? (
            <text
              x={width - 1}
              y={Math.max(8, geometry.boundY - 3)}
              textAnchor="end"
              fontSize="7.5"
              fill="#6e6e76"
            >
              {boundLabel}
            </text>
          ) : null}
        </g>
      ) : null}

      <polygon points={geometry.area} fill={`url(#${gradientId})`} />
      <polyline
        points={geometry.line}
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
