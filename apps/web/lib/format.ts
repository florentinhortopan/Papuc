import type { Market } from "@papuc/core";

export function formatMoney(
  n: number | null | undefined,
  opts?: { fractionDigits?: number },
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const fd = opts?.fractionDigits ?? 0;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fd,
    minimumFractionDigits: fd,
  });
}

export function formatPct(
  n: number | null | undefined,
  fractionDigits = 1,
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(fractionDigits)}%`;
}

export function formatDscr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function formatMarket(m: Market | undefined): string {
  if (!m) return "Custom area";
  if (m.kind === "city") return `${m.city}, ${m.state}`;
  if (m.kind === "zip") return `ZIP ${m.zip}`;
  if (m.kind === "county") return `${m.county}, ${m.state}`;
  return "Custom area";
}
