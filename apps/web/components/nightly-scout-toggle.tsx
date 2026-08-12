"use client";

import { useState, type MouseEvent } from "react";

import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { updateProject } from "@/lib/projects";
import type { SubscriptionTier } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/**
 * Per-project Nightly scout control. Pro persists to the project row;
 * free users see a locked control that opens UpgradeDialog (Stripe TBD).
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
  /** Tighter layout for project grid cards. */
  compact?: boolean;
}) {
  const isPro = subscriptionTier === "pro";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Free always shows off visually — cron won't run for them anyway.
  const shownOn = isPro && enabled;

  async function persist(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await updateProject(supabase, projectId, {
        nightly_scout_enabled: next,
      });
      onEnabledChange(next);
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
      setUpgradeOpen(true);
      return;
    }
    void persist(!enabled);
  }

  return (
    <>
      <div
        className={
          compact
            ? "flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border"
            : "flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2"
        }
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-text text-xs font-semibold">Nightly scout</p>
            {!isPro ? (
              <Badge variant="primary" className="text-[10px] px-1.5 py-0">
                Pro
              </Badge>
            ) : null}
          </div>
          <p className="text-textMuted text-[11px] leading-4">
            {isPro
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
          aria-label={
            !isPro
              ? "Nightly scout requires Papuc Pro"
              : shownOn
                ? "Turn off nightly scout"
                : "Turn on nightly scout"
          }
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

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature="Nightly scout runs every morning for projects you enable — catch new listings that match your goals without clicking Scout deals."
      />
    </>
  );
}
