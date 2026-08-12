"use client";

import { useState, type MouseEvent } from "react";

import { updateProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";

/**
 * Opt a project into the shared Papuc home feed. Off by default — deals
 * stay private until the owner enables this.
 */
export function PublicFeedToggle({
  projectId,
  enabled,
  onEnabledChange,
}: {
  projectId: string;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await updateProject(supabase, projectId, { is_public: next });
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
    void persist(!enabled);
  }

  return (
    <div
      className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="min-w-0">
        <p className="text-text text-xs font-semibold">Show on home feed</p>
        <p className="text-textMuted text-[11px] leading-4">
          {enabled
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
        aria-label={
          enabled
            ? "Hide project deals from home feed"
            : "Show project deals on home feed"
        }
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
