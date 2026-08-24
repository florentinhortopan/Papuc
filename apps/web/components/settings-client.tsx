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
  userId,
  displayName: initialDisplayName,
  autoConditionAnalysis: initialAutoCondition,
  nightlyScoutsPaused: initialNightlyPaused,
  emailDigestsEnabled: initialEmailDigests,
  isAdmin = false,
}: {
  email: string | null;
  tier: SubscriptionTier;
  userId: string | null;
  displayName: string | null;
  /** Default true when the column is missing / unset. */
  autoConditionAnalysis: boolean;
  /** Default false — nightly scouts run unless paused. */
  nightlyScoutsPaused: boolean;
  /** Default true — digests on unless opted out. */
  emailDigestsEnabled: boolean;
  /** True when session email is in ADMIN_EMAILS. */
  isAdmin?: boolean;
}) {
  const isPro = tier === "pro";
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [autoCondition, setAutoCondition] = useState(initialAutoCondition);
  const [nightlyPaused, setNightlyPaused] = useState(initialNightlyPaused);
  const [emailDigests, setEmailDigests] = useState(initialEmailDigests);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function persist(
    key: string,
    patch: Parameters<typeof updateProfileSettings>[1],
    rollback: () => void,
  ) {
    setSavingKey(key);
    setError(null);
    try {
      const supabase = createClient();
      await updateProfileSettings(supabase, patch);
    } catch (err) {
      rollback();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingKey(null);
    }
  }

  function requireProOrUpgrade(): boolean {
    if (isPro) return true;
    setShowUpgrade(true);
    return false;
  }

  async function toggleAutoCondition() {
    const next = !autoCondition;
    setAutoCondition(next);
    await persist(
      "auto",
      { auto_condition_analysis: next },
      () => setAutoCondition(!next),
    );
  }

  async function toggleNightlyPaused() {
    if (!requireProOrUpgrade()) return;
    const next = !nightlyPaused;
    setNightlyPaused(next);
    await persist(
      "nightly",
      { nightly_scouts_paused: next },
      () => setNightlyPaused(!next),
    );
  }

  async function toggleEmailDigests() {
    if (!requireProOrUpgrade()) return;
    const next = !emailDigests;
    setEmailDigests(next);
    await persist(
      "email",
      { email_digests_enabled: next },
      () => setEmailDigests(!next),
    );
  }

  async function saveDisplayName() {
    const next = displayName;
    await persist("name", { display_name: next }, () =>
      setDisplayName(initialDisplayName ?? ""),
    );
  }

  return (
    <div className="max-w-md">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      {isAdmin ? (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 mb-3">
          <p className="text-text text-sm font-semibold">Admin</p>
          <p className="text-textMuted text-xs mt-1 leading-5">
            Grant or revoke Pro and email users.
          </p>
          <a
            href="/admin"
            className="text-primary text-sm font-semibold hover:underline mt-2 inline-block"
          >
            Manage users →
          </a>
        </div>
      ) : null}

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <p className="text-textMuted text-xs">Signed in as</p>
        <p className="text-text text-base mt-1">{email ?? "—"}</p>
        {userId ? (
          <a
            href={`/u/${userId}`}
            className="text-primary text-xs hover:underline mt-2 inline-block"
          >
            View public profile →
          </a>
        ) : null}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <p className="text-textMuted text-xs mb-2">Display name</p>
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            placeholder="Shown on your investor profile"
            className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm text-text"
          />
          <Button
            type="button"
            size="sm"
            loading={savingKey === "name"}
            onClick={() => void saveDisplayName()}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-textMuted text-xs">Plan</p>
          <Badge variant={isPro ? "primary" : "muted"}>
            {tier.toUpperCase()}
          </Badge>
        </div>
        <p className="text-text text-base mt-1">
          {isPro
            ? nightlyPaused
              ? "Pro — nightly scouts paused"
              : "Background scouting + alerts enabled"
            : "Free plan — manual scouting only"}
        </p>
        {!isPro ? (
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

      <p className="text-textMuted text-xs font-semibold uppercase tracking-wide mb-2 mt-5">
        Scouting & alerts
      </p>

      <SettingsToggle
        title="Pause all nightly scouts"
        description="Temporarily stop background scouting across every project. Per-project toggles still apply when you unpause. Your Pro plan stays active."
        pressed={nightlyPaused}
        onToggle={() => void toggleNightlyPaused()}
        saving={savingKey === "nightly"}
        proOnly
        isPro={isPro}
      />

      <SettingsToggle
        title="Email digests"
        description="Morning email when nightly scout finds strong new deals. Turn off to keep scouting in-app without inbox noise."
        pressed={emailDigests}
        onToggle={() => void toggleEmailDigests()}
        saving={savingKey === "email"}
        proOnly
        isPro={isPro}
        disabled={nightlyPaused && isPro}
        disabledHint={
          nightlyPaused && isPro
            ? "Digests stay off while nightly scouts are paused."
            : undefined
        }
      />

      <p className="text-textMuted text-xs font-semibold uppercase tracking-wide mb-2 mt-5">
        Deal tools
      </p>

      <SettingsToggle
        title="Auto-run Catch the catch"
        description="When you open a property, analyze listing photos for rehab red flags automatically. Skips deals that already have a cached result — use Refresh on the panel to re-run."
        pressed={autoCondition}
        onToggle={() => void toggleAutoCondition()}
        saving={savingKey === "auto"}
      />

      {error ? (
        <p className="text-danger text-xs mt-2 mb-2">{error}</p>
      ) : null}

      <div className="mt-6">
        <SignOutButton />
      </div>

      <UpgradeDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Unlock background scouting, email digests, and pro-forma exports."
      />
    </div>
  );
}

function SettingsToggle({
  title,
  description,
  pressed,
  onToggle,
  saving,
  proOnly = false,
  isPro = true,
  disabled = false,
  disabledHint,
}: {
  title: string;
  description: string;
  pressed: boolean;
  onToggle: () => void;
  saving: boolean;
  proOnly?: boolean;
  isPro?: boolean;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const locked = proOnly && !isPro;
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-text text-sm font-semibold">{title}</p>
            {proOnly ? (
              <Badge variant="primary" className="text-[10px] px-1.5 py-0">
                Pro
              </Badge>
            ) : null}
          </div>
          <p className="text-textMuted text-xs leading-5 mt-1">{description}</p>
          {disabledHint ? (
            <p className="text-textMuted text-[11px] mt-1 italic">{disabledHint}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={saving || disabled}
          aria-pressed={locked ? false : pressed}
          aria-label={
            locked
              ? `${title} requires Papuc Pro`
              : pressed
                ? `Disable ${title}`
                : `Enable ${title}`
          }
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            !locked && pressed ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
              !locked && pressed ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
