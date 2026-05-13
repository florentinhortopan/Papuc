"use client";

import { defaultStrSchedule } from "@papuc/core";

import { Input } from "@/components/ui/input";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

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
    hint: "Days available per month",
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyADR",
    label: "ADR ($)",
    hint: "Average daily rate",
    formatter: (n) => String(Math.round(n)),
  },
  {
    key: "monthlyOccupancy",
    label: "Occ %",
    hint: "Occupancy fraction (0–1)",
    formatter: (n) => n.toFixed(2),
  },
  {
    key: "monthlyAvgStays",
    label: "Stays",
    hint: "Bookings per month",
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
    <div className="bg-surfaceAlt border border-border rounded-2xl p-4">
      <p className="text-text text-sm font-semibold mb-1">12-month STR matrix</p>
      <p className="text-textMuted text-xs mb-3">
        Berkeley.xlsx rows 31-34: nights, ADR, occupancy, stays per month.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-textMuted font-normal w-28 pb-1"></th>
              {MONTHS.map((m, i) => (
                <th
                  key={i}
                  className="text-textMuted font-normal text-center pb-1 w-14"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="pr-2 py-1 align-middle">
                  <p className="text-text text-xs">{row.label}</p>
                  <p className="text-textMuted text-[10px]">{row.hint}</p>
                </td>
                {value[row.key].map((v, i) => (
                  <td key={i} className="px-0.5 py-1 w-14">
                    <Input
                      value={row.formatter(v)}
                      onChange={(e) => updateCell(row.key, i, e.target.value)}
                      inputMode="decimal"
                      className="h-8 px-1.5 py-0 text-xs text-center"
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
