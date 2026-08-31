"use client";

import Link from "next/link";

import { FollowButton } from "@/components/follow-button";
import { WatchProjectButton } from "@/components/watch-project-button";

/**
 * P0 share affordances: Follow the sender, Watch the scout (if Discover-
 * public), and deep-link into the in-app public surfaces when available.
 */
export function ShareSocialBar({
  ownerId,
  ownerDisplayName,
  projectId,
  projectName,
  dealId,
  isPublic,
  isOwner,
  signedIn,
  initialFollowing,
  initialWatching,
  watcherCount,
  signInHref,
}: {
  ownerId: string;
  ownerDisplayName: string;
  projectId: string | null;
  projectName: string | null;
  dealId?: string | null;
  isPublic: boolean;
  isOwner: boolean;
  signedIn: boolean;
  initialFollowing: boolean;
  initialWatching: boolean;
  watcherCount: number;
  signInHref: string;
}) {
  if (isOwner || !ownerId) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-textMuted text-[11px] uppercase tracking-wide font-semibold">
            Shared by
          </p>
          <Link
            href={`/u/${ownerId}`}
            className="text-text text-sm font-semibold hover:text-primary truncate block"
          >
            {ownerDisplayName}
          </Link>
          <p className="text-textMuted text-xs mt-0.5">
            Follow to see their public deals in Friends
            {isPublic ? " · Watch to track this scout" : ""}.
          </p>
        </div>
        {!signedIn ? (
          <Link
            href={signInHref}
            className="shrink-0 inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2 hover:opacity-90"
          >
            Sign in to follow
          </Link>
        ) : null}
      </div>

      {signedIn ? (
        <div className="flex flex-wrap items-start gap-3">
          <FollowButton
            userId={ownerId}
            initialFollowing={initialFollowing}
            className="shrink-0"
          />
          {isPublic && projectId ? (
            <div className="min-w-0 flex-1">
              <WatchProjectButton
                projectId={projectId}
                initialWatching={initialWatching}
                watcherCount={watcherCount}
                compact
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {signedIn && isPublic ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-1 border-t border-border">
          {dealId ? (
            <Link
              href={`/deals/${dealId}`}
              className="text-primary hover:underline"
            >
              Open deal in Discover
            </Link>
          ) : null}
          {projectId ? (
            <Link
              href={`/projects/${projectId}`}
              className="text-primary hover:underline"
            >
              {projectName ? `View ${projectName}` : "View scout project"}
            </Link>
          ) : null}
          <Link href={`/u/${ownerId}`} className="text-textMuted hover:underline">
            Investor profile
          </Link>
        </div>
      ) : null}
    </div>
  );
}
