"use client";

import { Globe } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

import { updateProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Opt a project into the shared Papuc home feed. Off by default — deals
 * stay private until the owner enables this.
 *
 * `compact` = icon-only Globe for project grid cards (same row as
 * last-scout + nightly scout). Full layout keeps the labeled switch.
 */
export function PublicFeedToggle({
  projectId,
  enabled,
  onEnabledChange,
  compact = false,
}: {
  projectId: string;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  compact?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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
      await updateProject(supabase, projectId, { is_public: next });
      onEnabledChange(next);
      setFlash(next ? "Public on Discover" : "Hidden from Discover");
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
    void persist(!enabled);
  }

  const ariaLabel = enabled
    ? "Hide project deals from Discover feed"
    : "Show project deals on Discover feed";

  const tooltip = error
    ? error
    : enabled
      ? "Public on Discover — deals visible to signed-in users"
      : "Private — deals stay in this project only";

  if (compact) {
    return (
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
              flash.includes("Public")
                ? "border-primary/40 bg-primary text-primaryFg"
                : "border-border bg-surfaceAlt text-text",
            )}
          >
            {flash}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggleClick}
          disabled={saving}
          aria-pressed={enabled}
          aria-label={ariaLabel}
          title={tooltip}
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
            enabled
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-surfaceAlt/60 text-textMuted hover:text-text hover:border-border",
            error && "border-danger/40 text-danger",
          )}
        >
          <Globe className="h-4 w-4" strokeWidth={enabled ? 2.25 : 1.75} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Globe
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              enabled ? "text-primary" : "text-textMuted",
            )}
          />
          <p className="text-text text-xs font-semibold">Show on Discover</p>
        </div>
        <p className="text-textMuted text-[11px] leading-4">
          {flash
            ? flash
            : enabled
              ? "On — deals appear in Discover for all signed-in users"
              : "Off — deals stay private to this project"}
        </p>
        {error ? (
          <p className="text-danger text-[11px] mt-1">{error}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onToggleClick}
        disabled={saving}
        aria-pressed={enabled}
        aria-label={ariaLabel}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          enabled ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
