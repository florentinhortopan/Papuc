"use client";

import { defaultStrSchedule } from "@papuc/core";
import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface StrMatrixValue {
  monthlyNights: number[];
  monthlyADR: number[];
  monthlyOccupancy: number[];
  monthlyAvgStays: number[];
}

const ROWS: Array<{
  key: keyof StrMatrixValue;
  label: string;
  hint: string;
  formatter: (n: number) => string;
}> = [
  {
    key: "monthlyNights",
    label: "Nights",
    hint: "Days available",
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyADR",
    label: "ADR ($)",
    hint: "Avg daily rate",
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyOccupancy",
    label: "Occ %",
    hint: "0–1 fraction",
    formatter: (n) => n.toFixed(2),
  },
  {
    key: "monthlyAvgStays",
    label: "Stays",
    hint: "Bookings / mo",
    formatter: (n) => String(Math.round(n)),
  },
];

/** How long a programmatic smooth scroll "owns" the matrix scroller before
 *  manual-scroll events may steal the selection back (ms). */
const PROGRAMMATIC_SCROLL_MS = 700;

/**
 * Consolidated monthly profit chart + editable 12-month STR matrix with a
 * shared month focus:
 *
 *   - The bar chart shows all 12 months at a glance. Hovering (desktop),
 *     tapping, or dragging across bars (mobile) focuses a month: the bar
 *     highlights, its profit is labeled on the bar, a stat strip shows the
 *     month's nights/ADR/occupancy/stays, and the matrix scrolls that
 *     month's column into view.
 *   - Swiping the matrix focuses the column nearest the viewport center,
 *     which highlights the matching bar. Focusing any input does the same.
 */
export function StrCashflowMatrix({
  monthlyPreTaxProfit,
  value,
  onChange,
}: {
  monthlyPreTaxProfit: number[];
  value: StrMatrixValue;
  onChange: (v: StrMatrixValue) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const monthHeaderRefs = useRef<Array<HTMLTableCellElement | null>>([]);
  const programmaticScrollUntil = useRef(0);
  const scrollRaf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(scrollRaf.current), []);

  const data = monthlyPreTaxProfit.map((v, i) => ({
    month: MONTHS[i] ?? `M${i}`,
    profit: Math.round(v),
  }));

  function focusMonth(i: number, source: "chart" | "matrix") {
    if (i === selected || i < 0 || i >= 12) return;
    setSelected(i);
    if (source === "chart") scrollMatrixToMonth(i);
  }

  /** Center the month's column in the scroller (label column excluded). */
  function scrollMatrixToMonth(i: number) {
    const scroller = scrollerRef.current;
    const th = monthHeaderRefs.current[i];
    const first = monthHeaderRefs.current[0];
    if (!scroller || !th || !first) return;
    const labelW = first.offsetLeft; // sticky row-label column width
    const visibleW = scroller.clientWidth - labelW;
    const target = th.offsetLeft - labelW - (visibleW - th.offsetWidth) / 2;
    programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  /** Manual swipe/scroll → focus the column nearest the viewport center. */
  function handleMatrixScroll() {
    if (Date.now() < programmaticScrollUntil.current) return;
    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      const first = monthHeaderRefs.current[0];
      if (!scroller || !first) return;
      const labelW = first.offsetLeft;
      const centerX = scroller.scrollLeft + labelW + (scroller.clientWidth - labelW) / 2;
      let best = 0;
      let bestDist = Infinity;
      monthHeaderRefs.current.forEach((th, i) => {
        if (!th) return;
        const d = Math.abs(th.offsetLeft + th.offsetWidth / 2 - centerX);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setSelected(best);
    });
  }

  function pickFromChart(s: { activeTooltipIndex?: number } | null) {
    const i = s?.activeTooltipIndex;
    if (typeof i === "number") focusMonth(i, "chart");
  }

  function updateCell(key: keyof StrMatrixValue, monthIdx: number, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next: StrMatrixValue = {
      monthlyNights: [...value.monthlyNights],
      monthlyADR: [...value.monthlyADR],
      monthlyOccupancy: [...value.monthlyOccupancy],
      monthlyAvgStays: [...value.monthlyAvgStays],
    };
    next[key][monthIdx] = n;
    onChange(next);
  }

  const sel = selected;

  return (
    <div className="bg-surfaceAlt border border-border rounded-2xl p-4 min-w-0 max-w-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-text text-sm font-semibold">Monthly pre-tax profit</p>
          <p className="text-textMuted text-xs mt-0.5">
            Tap or hover a bar to focus a month; edit its STR assumptions below.
          </p>
        </div>
        <p className="text-textMuted text-[10px] shrink-0 pt-0.5 sm:hidden">
          ← swipe →
        </p>
      </div>

      {/* touch-pan-y: horizontal drags select bars, vertical still scrolls
          the page. */}
      <div className="min-w-0 w-full touch-pan-y" style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 18, right: 0, bottom: 0, left: 0 }}
            // recharts routes touch drags through the onMouseMove callback
            // internally (handleTouchMove → triggeredAfterMouseMove), so
            // these two cover hover, tap, and swipe-across-bars.
            onMouseMove={pickFromChart}
            onClick={pickFromChart}
          >
            <CartesianGrid stroke="#2a2a36" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#8b8b96"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#8b8b96"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              width={48}
            />
            <ReferenceLine y={0} stroke="#2a2a36" />
            <Bar dataKey="profit" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.profit >= 0 ? "#3ddc97" : "#ff5c7a"}
                  fillOpacity={sel !== null && sel !== i ? 0.35 : 1}
                  stroke={sel === i ? "#f5f5f7" : "none"}
                  strokeWidth={sel === i ? 1 : 0}
                />
              ))}
              <LabelList
                dataKey="profit"
                content={(props) => {
                  const { x, y, width, height, value: v, index } = props as {
                    x?: number | string;
                    y?: number | string;
                    width?: number | string;
                    height?: number | string;
                    value?: number | string;
                    index?: number;
                  };
                  if (index !== sel) return null;
                  const n = Number(v);
                  const h = Number(height);
                  const cx = Number(x) + Number(width) / 2;
                  // Positive (and stubby negative) bars label above the bar
                  // top; tall negative bars label inside the bar's lower end
                  // so the text never collides with the X axis.
                  const cy = n >= 0 || h <= 18 ? Number(y) - 6 : Number(y) + h - 6;
                  return (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      fill="#f5f5f7"
                      fontSize={11}
                      fontWeight={600}
                    >
                      {`$${n.toLocaleString()}`}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Focused-month stat strip. min-h reserves the line so focusing a
          month doesn't shift the layout below. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1 mb-3 min-h-[1.25rem]">
        {sel === null ? (
          <p className="text-textMuted text-xs">
            All 12 months shown — focus one for details.
          </p>
        ) : (
          <>
            <p className="text-text text-xs font-semibold">{MONTHS[sel]}</p>
            <p
              className={cn(
                "text-xs font-semibold tabular-nums",
                (data[sel]?.profit ?? 0) >= 0 ? "text-success" : "text-danger",
              )}
            >
              {`$${(data[sel]?.profit ?? 0).toLocaleString()}/mo`}
            </p>
            <p className="text-textMuted text-xs tabular-nums">
              {Math.round(value.monthlyNights[sel] ?? 0)} nights
            </p>
            <p className="text-textMuted text-xs tabular-nums">
              ${Math.round(value.monthlyADR[sel] ?? 0)}/night
            </p>
            <p className="text-textMuted text-xs tabular-nums">
              {Math.round((value.monthlyOccupancy[sel] ?? 0) * 100)}% occ
            </p>
            <p className="text-textMuted text-xs tabular-nums">
              {Math.round(value.monthlyAvgStays[sel] ?? 0)} stays
            </p>
          </>
        )}
      </div>

      {/*
        Sticky row labels + horizontally swipeable month cells. The table
        keeps intrinsic width for readable inputs; min-w-0 + overflow-x on
        the wrapper keeps it from blowing out the page grid.
      */}
      <div
        ref={scrollerRef}
        onScroll={handleMatrixScroll}
        className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x"
      >
        <table className="border-separate border-spacing-0 text-sm w-max">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-surfaceAlt text-left text-textMuted font-normal pb-2 pr-3 min-w-[5.5rem]"
              />
              {MONTHS.map((m, i) => (
                <th
                  key={i}
                  ref={(el) => {
                    monthHeaderRefs.current[i] = el;
                  }}
                  scope="col"
                  onClick={() => focusMonth(i, "matrix")}
                  className={cn(
                    "font-normal text-center pb-2 px-1 min-w-[3.75rem] cursor-pointer rounded-t-lg",
                    sel === i
                      ? "bg-primary/10 text-text font-semibold"
                      : "text-textMuted",
                  )}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surfaceAlt text-left align-middle pr-3 py-1.5 min-w-[5.5rem] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)]"
                >
                  <p className="text-text text-xs font-medium">{row.label}</p>
                  <p className="text-textMuted text-[10px] leading-tight">
                    {row.hint}
                  </p>
                </th>
                {value[row.key].map((v, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-1 py-1.5 min-w-[3.75rem]",
                      sel === i && "bg-primary/10",
                      sel === i && rowIdx === ROWS.length - 1 && "rounded-b-lg",
                    )}
                  >
                    <Input
                      value={row.formatter(v)}
                      onChange={(e) => updateCell(row.key, i, e.target.value)}
                      onFocus={() => focusMonth(i, "matrix")}
                      inputMode="decimal"
                      aria-label={`${row.label} ${MONTHS[i]}`}
                      className="h-9 min-w-[3.25rem] px-1.5 py-0 text-sm text-center tabular-nums"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Build a 12-month STR matrix seeded with a constant ADR. Thin wrapper
 * around the core `defaultStrSchedule` so the editor and the scout share
 * one source of truth for the seasonal curve. To match the scout's
 * implicit assumption (ADR = STR multiplier × LTR rent / 0.65 occupancy),
 * derive `adr` from `estimateSTRAdrFromLTRRent(monthlyLTRRent)` instead
 * of `monthlyLTRRent / 30`.
 */
export function defaultStrMatrix(adr: number): StrMatrixValue {
  const schedule = defaultStrSchedule(0);
  return {
    monthlyNights: schedule.monthlyNights,
    monthlyADR: new Array(12).fill(adr),
    monthlyOccupancy: schedule.monthlyOccupancy,
    monthlyAvgStays: schedule.monthlyAvgStays,
  };
}
