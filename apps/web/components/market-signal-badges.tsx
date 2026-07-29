import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";

/**
 * Opportunity / asset signal chips shared by the deal card and the deal
 * detail header, sourced from the market-signal columns the scout now
 * persists on `deals`:
 *
 *   - "New Xd"        listing is ≤7 days on market (freshness signal)
 *   - "Cut $N (x%)"   most recent price change was a reduction
 *   - "No HOA"        confirmed zero HOA (asset quality)
 *   - "HOA $N/mo"     known HOA burden; turns amber past $150/mo
 *
 * Unknown values render nothing — these chips are positive signals, not a
 * data-completeness report.
 */
export function MarketSignalBadges({
  daysOnMarket,
  priceChange,
  price,
  hoaMonthly,
}: {
  daysOnMarket: number | null | undefined;
  /** Most recent list-price change in USD; negative = cut. */
  priceChange: number | null | undefined;
  /** Current price, used to express the cut as a percentage. */
  price: number | null | undefined;
  hoaMonthly: number | null | undefined;
}) {
  const badges: ReactNode[] = [];

  if (
    typeof daysOnMarket === "number" &&
    Number.isFinite(daysOnMarket) &&
    daysOnMarket >= 0 &&
    daysOnMarket <= 7
  ) {
    badges.push(
      <Badge key="new" variant="success" title="Listed within the last week">
        New {Math.max(1, Math.round(daysOnMarket))}d
      </Badge>,
    );
  }

  if (
    typeof priceChange === "number" &&
    Number.isFinite(priceChange) &&
    priceChange < 0
  ) {
    const cut = Math.abs(priceChange);
    const pct =
      typeof price === "number" && price > 0
        ? ` (${((cut / price) * 100).toFixed(1)}%)`
        : "";
    badges.push(
      <Badge
        key="cut"
        variant="primary"
        title="Most recent price change was a reduction — often a motivated seller"
      >
        Cut {formatMoney(cut)}
        {pct}
      </Badge>,
    );
  }

  if (typeof hoaMonthly === "number" && Number.isFinite(hoaMonthly)) {
    if (hoaMonthly === 0) {
      badges.push(
        <Badge key="hoa" variant="success" title="Confirmed no HOA fee">
          No HOA
        </Badge>,
      );
    } else if (hoaMonthly > 0) {
      badges.push(
        <Badge
          key="hoa"
          variant={hoaMonthly > 150 ? "warning" : "muted"}
          title="Monthly HOA fee reported by the listing"
        >
          HOA {formatMoney(hoaMonthly)}/mo
        </Badge>,
      );
    }
  }

  if (!badges.length) return null;
  return <>{badges}</>;
}
