"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function InviteAcceptClient({
  token,
  projectName,
  ownerDisplayName,
  signedIn,
}: {
  token: string;
  projectName: string;
  ownerDisplayName: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}`, { method: "POST" });
      const json = (await res.json()) as {
        projectId?: string;
        alreadyOwner?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not join");
      const id = json.projectId;
      if (id) router.push(`/projects/${id}`);
      else throw new Error("Missing project");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 space-y-6">
      <div className="space-y-2">
        <p className="text-textMuted text-sm">Co-scout invite</p>
        <h1 className="text-text text-2xl font-semibold tracking-tight">
          {projectName}
        </h1>
        <p className="text-textMuted text-sm">
          {ownerDisplayName} invited you to scout and act on deals in this
          project.
        </p>
      </div>
      {signedIn ? (
        <div className="space-y-3">
          <Button
            type="button"
            loading={busy}
            onClick={() => void accept()}
            className="w-full"
          >
            Join project
          </Button>
          {error ? <p className="text-danger text-sm">{error}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>
              Sign in to join
            </Link>
          </Button>
          <p className="text-textMuted text-xs">
            After sign-in you&apos;ll return here to accept.
          </p>
        </div>
      )}
      <p className="text-textMuted text-xs">
        <Link href="/home" className="text-primary hover:underline">
          Back to Discover
        </Link>
      </p>
    </div>
  );
}
