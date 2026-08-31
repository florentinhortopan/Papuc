"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function WatchProjectButton({
  projectId,
  initialWatching,
  watcherCount: initialCount,
  compact = false,
}: {
  projectId: string;
  initialWatching: boolean;
  watcherCount: number;
  /** Tighter layout for share bars / dense chrome. */
  compact?: boolean;
}) {
  const [watching, setWatching] = useState(initialWatching);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    setError(null);
    const next = !watching;
    setWatching(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const res = await fetch(`/api/projects/${projectId}/watch`, {
        method: next ? "POST" : "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "watch failed");
      router.refresh();
    } catch (err) {
      setWatching(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? undefined : "mb-3"}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={watching ? "secondary" : "primary"}
          loading={busy}
          onClick={() => void toggle()}
        >
          {watching ? "Watching" : "Watch"}
        </Button>
        <span className="text-textMuted text-xs">
          {count} {count === 1 ? "watcher" : "watchers"}
        </span>
      </div>
      {compact ? null : (
        <p className="text-textMuted text-xs mt-2 leading-5">
          Watch to see new public deals from this scout in Friends. You
          won&apos;t be able to edit filters until collaboration ships.
        </p>
      )}
      {error ? <p className="text-danger text-xs mt-1">{error}</p> : null}
    </div>
  );
}
