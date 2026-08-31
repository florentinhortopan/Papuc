"use client";

import { Heart, RotateCcw, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { dealStreetAddress } from "@/lib/deal-address";
import type { FeedDeal } from "@/lib/feed";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function ownerInitials(name: string | null | undefined): string {
  const raw = (name ?? "Investor").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase() || "?";
}

export function FeedDealCard({
  deal,
  className,
  busy = false,
  saved = false,
  onSave,
  onSkip,
  skipLabel,
  onFollowChange,
}: {
  deal: FeedDeal;
  className?: string;
  busy?: boolean;
  saved?: boolean;
  onSave?: () => void;
  onSkip?: () => void;
  /** When set (e.g. Restore on Skipped chip), replaces the X icon. */
  skipLabel?: string;
  /** Soft-follow from Discover — stamps Friends once the owner has public deals. */
  onFollowChange?: (ownerId: string, following: boolean) => void;
}) {
  const photo =
    deal.primary_image_url ??
    (Array.isArray(deal.photos) ? (deal.photos as string[])[0] : undefined);
  const street = dealStreetAddress(deal);
  const place = [deal.city, deal.state].filter(Boolean).join(", ");
  const score = deal.score?.score;
  const cashflow = deal.score?.monthly_cashflow;
  const ownerName = deal.ownerDisplayName ?? "Investor";
  const showOwner = !deal.isOwn;
  const [following, setFollowing] = useState(Boolean(deal.isFollowingOwner));
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(Boolean(deal.isFollowingOwner));
  }, [deal.isFollowingOwner, deal.project.owner_id]);

  async function toggleFollow() {
    if (followBusy || !showOwner) return;
    setFollowBusy(true);
    setFollowError(null);
    const next = !following;
    setFollowing(next);
    onFollowChange?.(deal.project.owner_id, next);
    try {
      const res = await fetch(`/api/users/${deal.project.owner_id}/follow`, {
        method: next ? "POST" : "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "follow failed");
    } catch (err) {
      setFollowing(!next);
      onFollowChange?.(deal.project.owner_id, !next);
      setFollowError(err instanceof Error ? err.message : String(err));
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className={className ?? "w-[240px] shrink-0 snap-start"}>
      <div className="relative">
        <Link href={`/deals/${deal.id}`} className="block group">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surfaceAlt border border-border">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-textMuted text-xs">No photo</span>
              </div>
            )}
            {deal.isNew ? (
              <div className="absolute left-2 top-2 bg-primary rounded-full px-2 py-0.5 z-[1]">
                <span className="text-primaryFg text-[10px] font-bold uppercase tracking-wide">
                  New
                </span>
              </div>
            ) : null}
            {typeof score === "number" ? (
              <div className="absolute right-2 top-2 bg-black/65 rounded-full px-2 py-0.5 z-[1]">
                <span className="text-white text-xs font-semibold">{score}</span>
              </div>
            ) : null}
            {showOwner ? (
              <div className="absolute left-2 bottom-2 z-[1] flex items-center gap-1.5 rounded-full bg-black/70 pl-1 pr-2 py-1 max-w-[85%]">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/90 text-[10px] font-bold text-primaryFg"
                  aria-hidden
                >
                  {ownerInitials(ownerName)}
                </span>
                <span className="truncate text-[11px] font-medium text-white">
                  {ownerName}
                </span>
              </div>
            ) : null}
          </div>
        </Link>

        {onSave || onSkip ? (
          <div className="absolute bottom-2 right-2 z-10 flex gap-1.5">
            {onSkip ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSkip();
                }}
                aria-label={skipLabel ?? "Skip deal"}
                title={skipLabel ?? "Skip — hide from For you"}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:opacity-50 shadow"
              >
                {skipLabel ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
            {onSave ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSave();
                }}
                aria-label={saved ? "Unsave deal" : "Save deal"}
                aria-pressed={saved}
                title={saved ? "Remove from Saved" : "Save to Portfolio"}
                className={`flex h-8 w-8 items-center justify-center rounded-full shadow disabled:opacity-50 ${
                  saved
                    ? "bg-primary text-primaryFg"
                    : "bg-black/70 text-white hover:bg-primary"
                }`}
              >
                <Heart
                  className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`}
                />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link href={`/deals/${deal.id}`} className="block mt-2 px-0.5">
        <p className="text-text text-sm font-semibold truncate">
          {street || place || "Address pending"}
        </p>
        <p className="text-textMuted text-xs mt-0.5 truncate">
          {[
            place || null,
            deal.price != null ? formatMoney(Number(deal.price)) : null,
            cashflow != null
              ? `${Number(cashflow) >= 0 ? "+" : ""}${formatMoney(Number(cashflow))}/mo`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Link>
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <Link
          href={`/projects/${deal.project.id}`}
          className="inline-flex max-w-full items-center rounded-full border border-border bg-surfaceAlt px-2 py-0.5 text-[11px] text-textMuted hover:text-text hover:border-primary/40 transition-colors"
          title={`Open project ${deal.project.name}`}
        >
          <span className="truncate">
            {deal.isOwn ? "Your project · " : ""}
            {deal.project.name}
          </span>
        </Link>
        {showOwner ? (
          <>
            <Link
              href={`/u/${deal.project.owner_id}`}
              className="inline-flex max-w-[120px] items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[11px] text-textMuted hover:text-primary hover:border-primary/40 transition-colors"
              title="View investor profile"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[8px] font-bold text-primary"
                aria-hidden
              >
                {ownerInitials(ownerName)}
              </span>
              <span className="truncate">{ownerName}</span>
            </Link>
            <button
              type="button"
              disabled={followBusy}
              onClick={() => void toggleFollow()}
              aria-pressed={following}
              title={
                following
                  ? "Unfollow — remove from Friends"
                  : "Follow — add their public deals to Friends"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50",
                following
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-surfaceAlt text-textMuted hover:text-primary hover:border-primary/40",
              )}
            >
              <UserPlus className="h-3 w-3" />
              {following ? "Following" : "Follow"}
            </button>
          </>
        ) : null}
      </div>
      {followError ? (
        <p className="text-danger text-[10px] mt-1 px-0.5">{followError}</p>
      ) : null}
    </div>
  );
}
