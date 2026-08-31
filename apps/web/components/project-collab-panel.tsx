"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Button } from "@/components/ui/button";
import type { ProjectMemberListItem } from "@/lib/project-members";
import type { SubscriptionTier } from "@/lib/database.types";

export function ProjectCollabPanel({
  projectId,
  subscriptionTier,
}: {
  projectId: string;
  subscriptionTier: SubscriptionTier;
}) {
  const isPro = subscriptionTier === "pro";
  const [members, setMembers] = useState<ProjectMemberListItem[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/invite`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        members?: ProjectMemberListItem[];
      };
      setMembers(json.members ?? []);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2800);
    return () => window.clearTimeout(t);
  }, [flash]);

  async function mintInvite(rotate = false) {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate }),
      });
      const json = (await res.json()) as {
        url?: string;
        error?: string;
        feature?: string;
      };
      if (res.status === 403 && json.error === "pro_required") {
        setUpgradeOpen(true);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Invite failed");
      setInviteUrl(json.url ?? null);
      if (json.url) {
        try {
          await navigator.clipboard.writeText(json.url);
          setFlash(rotate ? "New link copied" : "Invite link copied");
        } catch {
          setFlash("Invite ready");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/members/${userId}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      setFlash("Removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pt-1 border-t border-border">
      <p className="text-text text-xs font-semibold">Co-scout</p>
      <p className="text-textMuted text-xs leading-4">
        Invite investor friends to scout and act on deals in this project.
        {!isPro ? " Pro feature." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => void mintInvite(false)}
        >
          {isPro ? "Copy invite link" : "Invite friends"}
        </Button>
        {isPro && inviteUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void mintInvite(true)}
          >
            Rotate link
          </Button>
        ) : null}
      </div>
      {inviteUrl ? (
        <p className="text-textMuted text-[11px] break-all">{inviteUrl}</p>
      ) : null}
      {flash ? <p className="text-primary text-xs">{flash}</p> : null}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
      {members.length > 0 ? (
        <ul className="space-y-1.5 pt-1">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <Link
                href={`/u/${m.userId}`}
                className="text-text hover:text-primary truncate"
              >
                {m.displayName}
                <span className="text-textMuted"> · {m.role}</span>
              </Link>
              <button
                type="button"
                className="text-danger shrink-0 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => void removeMember(m.userId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-textMuted text-[11px]">No collaborators yet.</p>
      )}
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature="Invite investor friends to co-scout a private project — share an invite link so they can run scouts and act on deals with you."
      />
    </div>
  );
}
