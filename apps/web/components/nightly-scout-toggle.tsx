"use client";

import { Binoculars } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { updateProject } from "@/lib/projects";
import type { SubscriptionTier } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Per-project Nightly scout control. Pro persists to the project row;
 * free users see a locked control that opens UpgradeDialog (Stripe TBD).
 *
 * `compact` = icon-only Binoculars button for dense project cards (same
 * row as last-scout timestamp). Full layout keeps the labeled switch.
 */
export function NightlyScoutToggle({
  projectId,
  enabled,
  onEnabledChange,
  subscriptionTier,
  compact = false,
}: {
  projectId: string;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  subscriptionTier: SubscriptionTier;
  /** Icon-only scout control for project grid cards. */
  compact?: boolean;
}) {
  const isPro = subscriptionTier === "pro";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Free always shows off visually — cron won't run for them anyway.
  const shownOn = isPro && enabled;

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(t);
  }, [flash]);

  async function persist(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await updateProject(supabase, projectId, {
        nightly_scout_enabled: next,
      });
      onEnabledChange(next);
      setFlash(next ? "Nightly scout on" : "Nightly scout off");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function onToggleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    if (!isPro) {
      setFlash("Requires Papuc Pro");
      setUpgradeOpen(true);
      return;
    }
    void persist(!enabled);
  }

  const ariaLabel = !isPro
    ? "Nightly scout requires Papuc Pro"
    : shownOn
      ? "Turn off nightly scout"
      : "Turn on nightly scout";

  const tooltip = error
    ? error
    : !isPro
      ? "Nightly scout — Papuc Pro"
      : shownOn
        ? "Nightly scout on — new listings every morning"
        : "Nightly scout off — manual Scout deals only";

  return (
    <>
      {compact ? (
        <div
          className="relative shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {flash ? (
            <div
              role="status"
              className={cn(
                "pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-semibold shadow-lg z-10 animate-in fade-in zoom-in-95",
                flash.includes("on") && !flash.includes("Requires")
                  ? "border-primary/40 bg-primary text-primaryFg"
                  : flash.includes("off")
                    ? "border-border bg-surfaceAlt text-text"
                    : "border-primary/40 bg-surface text-primary",
              )}
            >
              {flash}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggleClick}
            disabled={saving}
            aria-pressed={shownOn}
            aria-label={ariaLabel}
            title={tooltip}
            className={cn(
              "relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
              shownOn
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-surfaceAlt/60 text-textMuted hover:text-text hover:border-border",
              error && "border-danger/40 text-danger",
            )}
          >
            <Binoculars
              className="h-4 w-4"
              strokeWidth={shownOn ? 2.25 : 1.75}
            />
            {!isPro ? (
              <span className="absolute -right-1 -top-1 rounded bg-primary px-1 py-px text-[8px] font-bold leading-none text-primaryFg">
                Pro
              </span>
            ) : null}
          </button>
        </div>
      ) : (
        <div
          className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Binoculars
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  shownOn ? "text-primary" : "text-textMuted",
                )}
              />
              <p className="text-text text-xs font-semibold">Nightly scout</p>
              {!isPro ? (
                <Badge variant="primary" className="text-[10px] px-1.5 py-0">
                  Pro
                </Badge>
              ) : null}
            </div>
            <p className="text-textMuted text-[11px] leading-4">
              {flash
                ? flash
                : isPro
                  ? shownOn
                    ? "On — new listings while you sleep"
                    : "Off — manual Scout deals only"
                  : "New listings while you sleep"}
            </p>
            {error ? (
              <p className="text-danger text-[11px] mt-1">{error}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onToggleClick}
            disabled={saving}
            aria-pressed={shownOn}
            aria-label={ariaLabel}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              shownOn ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                shownOn ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature="Nightly scout runs every morning for projects you enable — catch new listings that match your goals without clicking Scout deals."
      />
    </>
  );
}
