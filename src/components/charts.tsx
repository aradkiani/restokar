"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatCompact, formatMoney, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

/**
 * Chart primitives.
 *
 * Colour comes from a validated categorical palette (adjacent-pair CVD ΔE 9.1,
 * normal-vision ΔE 19.6 against a white surface). Three slots sit below 3:1
 * contrast, so every chart that uses the categorical ramp ships **direct
 * labels** — the relief that keeps those series readable without relying on
 * hue. Single-series charts use one hue and carry no legend; the title names
 * the series.
 *
 * All marks are SVG: no chart library, so the payload stays small and the
 * geometry is exactly what we specify.
 */

export const SERIES = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const;

/**
 * Chart ink, pointed at the theme tokens rather than fixed hex.
 *
 * These were literal light-mode greys, which meant a dark dashboard rendered
 * near-black gridlines and axis labels on a near-black card — the chart was
 * still there and simply could not be read. The categorical SERIES ramp above
 * is deliberately *not* themed: those hues were validated for contrast and
 * colour-vision separation, and re-picking them per theme would invalidate that
 * work.
 */
const INK = {
  primary: "var(--color-ink-900)",
  secondary: "var(--color-ink-600)",
  muted: "var(--color-ink-500)",
  grid: "var(--color-ink-200)",
  axis: "var(--color-ink-300)",
  surface: "var(--color-surface)",
} as const;

/** Nice round upper bound so gridlines land on readable numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// --------------------------------------------------------------- stat tiles

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  /** Node rather than string so a tile can carry a formatted delta. */
  hint?: React.ReactNode;
  tone?: "neutral" | "positive" | "negative" | "brand";
  icon?: React.ReactNode;
}) {
  const tones = {
    neutral: "text-ink-900",
    positive: "text-emerald-700",
    negative: "text-red-700",
    brand: "text-brand-700",
  } as const;

  return (
    <div className="rounded-[var(--radius-lg)] border border-ink-200 bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-500">{label}</p>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      {/* Proportional figures for a standalone hero number. */}
      <p className={cn("mt-2 text-2xl leading-none font-black", tones[tone])}>{value}</p>
      {hint && <div className="mt-1.5 text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}

// -------------------------------------------------------------- line / area

export interface TrendPoint {
  label: string;
  value: number;
  secondary?: number;
}

/**
 * Single-series revenue trend with a crosshair + tooltip. An HTML chart is
 * interactive by nature; a static one throws away the detail a reader wants.
 */
export function TrendChart({
  points,
  locale,
  valueFormatter,
  height = 220,
  emptyLabel,
  ariaLabel,
}: {
  points: TrendPoint[];
  locale: Locale;
  valueFormatter?: (v: number) => string;
  height?: number;
  emptyLabel: string;
  ariaLabel: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const fmt = valueFormatter ?? ((v: number) => formatMoney(v, locale));

  if (points.length === 0 || points.every((p) => p.value === 0)) {
    return <ChartEmpty label={emptyLabel} height={height} />;
  }

  const width = 720;
  // Persian compact notation spells the unit out — "۲۰ میلیون" against English
  // "20M" — so the value gutter has to be wider in Persian or the widest tick
  // is clipped at the viewBox edge.
  const pad = { top: 16, right: 12, bottom: 28, left: locale === "fa" ? 76 : 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  const x = (i: number) => pad.left + i * stepX;
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(points.length - 1)},${pad.top + plotH} L${x(0)},${
    pad.top + plotH
  } Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // The SVG scales to its container, so map client px back to viewBox units.
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.round((px - pad.left) / (stepX || 1));
    setHover(Math.max(0, Math.min(points.length - 1, index)));
  }

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        // The plot is a physical left-to-right coordinate system: x grows
        // rightwards and time runs with it. Inheriting the document's RTL
        // direction flips what `text-anchor="end"` means, which pushed the
        // value labels out of their gutter and on top of the data.
        style={{ height, direction: "ltr" }}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity="0.22" />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Recessive grid — present for reading values, never competing. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={INK.grid}
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="10"
              fill={INK.muted}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatCompact(tick, locale)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#trend-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke={SERIES[0]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X labels thinned so they never collide on a 90-day range. */}
        {points.map((point, i) => {
          const every = Math.ceil(points.length / 7);
          if (i % every !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={point.label}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="10"
              fill={INK.muted}
            >
              {point.label}
            </text>
          );
        })}

        {active && hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke={INK.axis}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* 2px surface ring keeps the marker legible over the fill. */}
            <circle
              cx={x(hover)}
              cy={y(active.value)}
              r="5"
              fill={SERIES[0]}
              stroke={INK.surface}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 py-2 text-xs shadow-[var(--shadow-lift)]"
          style={{
            // Physical `left`, not `inset-inline-start`: the offset is measured
            // in the SVG's left-to-right space, so resolving it against the
            // page's RTL direction mirrored the tooltip to the far side of the
            // chart from the crosshair it describes.
            left: `${((x(hover) - pad.left) / plotW) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-bold text-ink-900">{active.label}</p>
          <p className="mt-0.5 text-ink-600 tabular-nums">{fmt(active.value)}</p>
          {active.secondary !== undefined && (
            <p className="text-ink-500 tabular-nums">
              {formatNumber(active.secondary, locale)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- bar (ranked)

export interface BarDatum {
  label: string;
  value: number;
  /** Secondary figure shown after the value, e.g. units sold. */
  meta?: string;
}

/**
 * Horizontal ranked bars with direct labels on every row. Labels are the
 * relief that lets the categorical ramp be used on a white surface, and they
 * remove the need for a value axis entirely.
 */
export function RankedBars({
  data,
  locale,
  valueFormatter,
  colorful = false,
  emptyLabel,
  maxRows = 8,
}: {
  data: BarDatum[];
  locale: Locale;
  valueFormatter?: (v: number) => string;
  colorful?: boolean;
  emptyLabel: string;
  maxRows?: number;
}) {
  const fmt = valueFormatter ?? ((v: number) => formatMoney(v, locale));
  const rows = data.slice(0, maxRows);

  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return <ChartEmpty label={emptyLabel} height={160} />;
  }

  const max = Math.max(...rows.map((r) => r.value)) || 1;

  return (
    <ul className="space-y-3">
      {rows.map((row, index) => {
        const pct = Math.max(2, (row.value / max) * 100);
        // Colour follows the entity's rank slot only in the "colorful" mode,
        // which is used where each row *is* a distinct category.
        const color = colorful ? SERIES[index % SERIES.length] : SERIES[0];

        return (
          <li key={`${row.label}-${index}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="truncate font-semibold text-ink-800">{row.label}</span>
              </span>
              {/* Two independent figures, so they get a real layout gap and a
                  bidi isolate each. Run together with only a margin, the two
                  digit runs sat flush in RTL and read as one long number —
                  "۴۰٬۰۰۰٬۰۰۰" beside "۳۵۰ عدد" merged into a single figure. */}
              <span className="flex shrink-0 items-baseline gap-2.5 font-bold text-ink-900 tabular-nums">
                <bdi>{fmt(row.value)}</bdi>
                {row.meta && <bdi className="font-normal text-ink-500">{row.meta}</bdi>}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// -------------------------------------------------------------- column bars

/** Hour-of-day distribution. One hue: this is magnitude, not identity. */
export function ColumnChart({
  data,
  locale,
  emptyLabel,
  height = 160,
}: {
  data: { label: string; value: number }[];
  locale: Locale;
  emptyLabel: string;
  height?: number;
}) {
  const [hover, setHover] = React.useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <ChartEmpty label={emptyLabel} height={height} />;
  }

  const max = Math.max(...data.map((d) => d.value)) || 1;

  return (
    <div className="relative" style={{ height }}>
      <div className="flex h-full items-end gap-[2px]">
        {data.map((point, index) => {
          const pct = (point.value / max) * 100;
          return (
            <div
              key={point.label}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                // 4px rounded data-end, anchored to the baseline.
                className="w-full rounded-t-[4px] transition-colors"
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: hover === index ? SERIES[0] : "#9ec5f4",
                }}
              />
              {hover === index && (
                // `left-1/2` pairs with the physical `-translate-x-1/2` to sit
                // centred over the column in both directions; `start-1/2`
                // resolves to `right` in RTL and shifted the label off the bar.
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-[var(--radius-xs)] border border-ink-200 bg-surface px-2 py-1 text-[10px] font-bold whitespace-nowrap tabular-nums shadow-[var(--shadow-soft)]">
                  {point.label} · {formatNumber(point.value, locale)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-500 tabular-nums">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function ChartEmpty({ label, height }: { label: string; height: number }) {
  return (
    <div
      className="grid place-items-center rounded-[var(--radius-md)] border border-dashed border-ink-200 text-xs font-semibold text-ink-400"
      style={{ height }}
    >
      {label}
    </div>
  );
}
