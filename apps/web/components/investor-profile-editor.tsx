"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { updateDisplayName } from "@/lib/social";
import { createClient } from "@/lib/supabase/client";

export function InvestorProfileEditor({
  initialDisplayName,
}: {
  initialDisplayName: string | null;
}) {
  const [name, setName] = useState(initialDisplayName ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const supabase = createClient();
      await updateDisplayName(supabase, name);
      setNote("Saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <label className="text-textMuted text-xs" htmlFor="display-name">
        Display name
      </label>
      <div className="flex gap-2">
        <input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Your name on Papuc"
          className="flex-1 h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text"
        />
        <Button type="button" size="sm" loading={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
      {note ? <p className="text-success text-xs">{note}</p> : null}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}
