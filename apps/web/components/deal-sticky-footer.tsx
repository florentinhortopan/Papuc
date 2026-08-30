"use client";

import { Heart, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Compact sticky deal chrome — shared contract for web today and native
 * WebView / RN later. Keep props flat and serializable; no app-router deps.
 */
export type DealStickyFooterProps = {
  price: number;
  /** Monthly pre-tax cashflow from the live scenario. */
  monthlyCashflow: number;
  downPayment: number;
  isSaved: boolean;
  /** When false, metrics only (public / view-only deals). */
  showActions?: boolean;
  saveBusy?: boolean;
  shareBusy?: boolean;
  onSave?: () => void;
  onUnsave?: () => void;
  onShare?: () => void;
  className?: string;
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "neutral";
}) {
  return (
    <div className="min-w-0 flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-textMuted">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums truncate",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          (!tone || tone === "neutral") && "text-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DealStickyFooter({
  price,
  monthlyCashflow,
  downPayment,
  isSaved,
  showActions = true,
  saveBusy = false,
  shareBusy = false,
  onSave,
  onUnsave,
  onShare,
  className,
}: DealStickyFooterProps) {
  const cfLabel =
    monthlyCashflow === 0
      ? formatMoneyCompact(0)
      : `${monthlyCashflow > 0 ? "+" : ""}${formatMoneyCompact(monthlyCashflow)}`;
  const cfTone =
    monthlyCashflow > 0
      ? "success"
      : monthlyCashflow < 0
        ? "danger"
        : "neutral";

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        className,
      )}
      data-deal-sticky-footer
    >
      <div
        className="container flex items-center gap-3 py-2.5"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
          <Metric label="Price" value={formatMoneyCompact(price)} />
          <Metric label="Cashflow" value={`${cfLabel}/mo`} tone={cfTone} />
          <Metric label="Down" value={formatMoneyCompact(downPayment)} />
        </div>

        {showActions ? (
          <div className="flex shrink-0 items-center gap-2">
            {isSaved ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 px-3"
                loading={saveBusy}
                onClick={onUnsave}
                aria-label="Unsave deal"
              >
                <Heart className="h-4 w-4 fill-current" strokeWidth={1.75} />
                Saved
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-9 px-3"
                loading={saveBusy}
                onClick={onSave}
                aria-label="Save deal"
              >
                <Heart className="h-4 w-4" strokeWidth={1.75} />
                Save
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 px-3"
              loading={shareBusy}
              onClick={onShare}
              aria-label="Share deal"
            >
              <Share2 className="h-4 w-4" strokeWidth={1.75} />
              Share
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
