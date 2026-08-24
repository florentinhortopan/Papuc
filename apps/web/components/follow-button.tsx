"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function FollowButton({
  userId,
  initialFollowing,
  className,
}: {
  userId: string;
  initialFollowing: boolean;
  className?: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    setError(null);
    const next = !following;
    setFollowing(next);
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: next ? "POST" : "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "follow failed");
      router.refresh();
    } catch (err) {
      setFollowing(!next);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={following ? "secondary" : "primary"}
        loading={busy}
        onClick={() => void toggle()}
      >
        {following ? "Following" : "Follow"}
      </Button>
      {error ? <p className="text-danger text-xs mt-1">{error}</p> : null}
    </div>
  );
}
