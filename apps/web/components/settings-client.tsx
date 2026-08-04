"use client";

import { useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SubscriptionTier } from "@/lib/database.types";
import { updateProfileSettings } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

export function SettingsClient({
  email,
  tier,
  autoConditionAnalysis: initialAutoCondition,
}: {
  email: string | null;
  tier: SubscriptionTier;
  /** Default true when the column is missing / unset. */
  autoConditionAnalysis: boolean;
}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [autoCondition, setAutoCondition] = useState(initialAutoCondition);
  const [savingAuto, setSavingAuto] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  async function toggleAutoCondition() {
    const next = !autoCondition;
    setAutoCondition(next);
    setSavingAuto(true);
    setAutoError(null);
    try {
      const supabase = createClient();
      await updateProfileSettings(supabase, {
        auto_condition_analysis: next,
      });
    } catch (err) {
      setAutoCondition(!next);
      setAutoError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAuto(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <p className="text-textMuted text-xs">Signed in as</p>
        <p className="text-text text-base mt-1">{email ?? "—"}</p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-textMuted text-xs">Plan</p>
          <Badge variant={tier === "pro" ? "primary" : "muted"}>
            {tier.toUpperCase()}
          </Badge>
        </div>
        <p className="text-text text-base mt-1">
          {tier === "pro"
            ? "Background scouting + alerts enabled"
            : "Free plan — manual scouting only"}
        </p>
        {tier !== "pro" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUpgrade(true)}
            className="mt-3"
          >
            See Papuc Pro
          </Button>
        ) : null}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-text text-sm font-semibold">
              Auto-run Catch the catch
            </p>
            <p className="text-textMuted text-xs leading-5 mt-1">
              When you open a property, analyze listing photos for rehab
              red flags automatically. Skips deals that already have a
              cached result — use Refresh on the panel to re-run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleAutoCondition()}
            disabled={savingAuto}
            aria-pressed={autoCondition}
            aria-label={
              autoCondition
                ? "Disable auto Catch the catch"
                : "Enable auto Catch the catch"
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              autoCondition ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                autoCondition ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {autoError ? (
          <p className="text-danger text-xs mt-2">{autoError}</p>
        ) : null}
      </div>

      <div className="mt-6">
        <SignOutButton />
      </div>

      <UpgradeDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Unlock background scouting, email alerts, and pro-forma exports."
      />
    </div>
  );
}
