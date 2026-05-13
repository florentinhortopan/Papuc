import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";

/**
 * Compact monthly cashflow chip used on deal cards, the deal-detail badge
 * row, and anywhere else we want a one-glance "sustainability" indicator.
 *
 * Color rule (matches the DSCR badge so users learn the same green/yellow/
 * red mental model):
 *   ≥  $100/mo  → success (clear positive)
 *   ≥ -$100/mo  → warning (around break-even)
 *           else → danger  (clearly negative)
 *
 * Passing `null` / `undefined` renders a neutral "Cashflow —" pill so the
 * absence of data is always shown rather than silently dropped.
 */
export function CashflowBadge({
  monthlyCashflow,
  prefix = "Cashflow",
}: {
  monthlyCashflow: number | null | undefined;
  prefix?: string;
}) {
  if (monthlyCashflow == null || !Number.isFinite(monthlyCashflow)) {
    return <Badge>{prefix} —</Badge>;
  }
  let variant: "success" | "warning" | "danger" = "danger";
  if (monthlyCashflow >= 100) variant = "success";
  else if (monthlyCashflow >= -100) variant = "warning";
  const sign = monthlyCashflow >= 0 ? "+" : "";
  return (
    <Badge variant={variant}>
      {prefix} {sign}
      {formatMoney(monthlyCashflow)}/mo
    </Badge>
  );
}
