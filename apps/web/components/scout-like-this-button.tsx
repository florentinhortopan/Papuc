"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ScoutLikeThisButton({
  dealId,
  className,
  variant = "primary",
  label = "Scout like this",
}: {
  dealId: string;
  className?: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/scout-like-this`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alsoFollowOwner: true,
          alsoWatchProject: true,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        projectId?: string;
      };
      if (!res.ok || !json.projectId) {
        throw new Error(json.error ?? "scout like this failed");
      }
      router.push(`/projects/${json.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        loading={busy}
        onClick={() => void run()}
      >
        {label}
      </Button>
      {error ? <p className="text-danger text-xs mt-1">{error}</p> : null}
    </div>
  );
}
