"use client";

import { Lock } from "lucide-react";
import { useState, type ReactNode } from "react";

import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Inactive shell for Pro-only deal tools. Keeps the panel on the page
 * (so carousel badges / deep links have somewhere to land) and opens
 * UpgradeDialog instead of running the feature.
 */
export function ProLockedPanel({
  id,
  title,
  description,
  feature,
  teaser,
  className,
}: {
  id?: string;
  title: string;
  description: string;
  /** Passed into UpgradeDialog as the feature pitch. */
  feature: string;
  /** Optional peek (e.g. overall condition badge) without unlocking details. */
  teaser?: ReactNode;
  className?: string;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <>
      <div
        id={id}
        className={cn(
          "relative bg-surface border border-border rounded-2xl p-4 overflow-hidden",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-text text-base font-semibold">{title}</p>
              <Badge variant="primary" className="text-[10px] px-1.5 py-0">
                Pro
              </Badge>
            </div>
            <p className="text-textMuted text-xs mt-1 leading-5">{description}</p>
          </div>
          <Lock
            className="h-4 w-4 text-textMuted shrink-0 mt-0.5"
            aria-hidden
          />
        </div>

        {teaser ? (
          <div className="mb-3 rounded-xl border border-border bg-surfaceAlt/80 p-3 opacity-80">
            {teaser}
          </div>
        ) : (
          <div
            className="mb-3 h-16 rounded-xl border border-dashed border-border bg-surfaceAlt/40"
            aria-hidden
          />
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setUpgradeOpen(true)}
          className="w-full sm:w-auto"
        >
          Unlock with Pro
        </Button>
      </div>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature={feature}
      />
    </>
  );
}
