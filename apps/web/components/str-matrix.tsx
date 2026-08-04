"use client";

import { defaultStrSchedule } from "@papuc/core";

import { Input } from "@/components/ui/input";

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

export function StrMatrix({
  value,
  onChange,
}: {
  value: StrMatrixValue;
  onChange: (v: StrMatrixValue) => void;
}) {
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

  return (
    <div className="bg-surfaceAlt border border-border rounded-2xl p-4 min-w-0 max-w-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-text text-sm font-semibold">12-month STR matrix</p>
          <p className="text-textMuted text-xs mt-0.5">
            Nights, ADR, occupancy, and stays. Swipe months on small screens.
          </p>
        </div>
        <p className="text-textMuted text-[10px] shrink-0 pt-0.5 sm:hidden">
          ← swipe →
        </p>
      </div>

      {/*
        Sticky row labels + horizontally swipeable month cells. The table
        keeps intrinsic width for readable inputs; min-w-0 + overflow-x on
        the wrapper keeps it from blowing out the page grid.
      */}
      <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x">
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
                  scope="col"
                  className="text-textMuted font-normal text-center pb-2 px-1 min-w-[3.75rem]"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
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
                  <td key={i} className="px-1 py-1.5 min-w-[3.75rem]">
                    <Input
                      value={row.formatter(v)}
                      onChange={(e) => updateCell(row.key, i, e.target.value)}
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
