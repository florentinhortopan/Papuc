"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

import { formatMarket, formatMoney } from "@/lib/format";
import type { ProjectListItem } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * Share a project the same way deals do: prefer the Web Share API, fall
 * back to clipboard. Uses the live project URL (public projects are
 * readable by other signed-in users via RLS).
 */
export function ProjectShareButton({
  project,
  compact = false,
}: {
  project: Pick<
    ProjectListItem,
    "id" | "name" | "raw_prompt" | "dealCount" | "constraints" | "is_public"
  >;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(t);
  }, [flash]);

  async function shareProject() {
    if (busy) return;
    setBusy(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/projects/${project.id}`;
      const market = formatMarket(project.constraints.markets[0]);
      const c = project.constraints;
      const title = project.name;
      const lines = [
        title,
        project.raw_prompt.trim(),
        [
          project.dealCount === 1
            ? "1 deal"
            : `${project.dealCount} deals`,
          market,
          c.strategy,
          c.priceMax ? `≤ ${formatMoney(c.priceMax)}` : null,
          `DSCR ≥ ${c.minDSCR.toFixed(2)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        project.is_public
          ? "Public on Papuc Discover"
          : "Private project (recipient needs access)",
        url,
      ].join("\n");

      const nav = (typeof navigator !== "undefined" ? navigator : null) as
        | (Navigator & {
            share?: (data: {
              title?: string;
              text?: string;
              url?: string;
            }) => Promise<void>;
          })
        | null;

      if (nav?.share) {
        try {
          await nav.share({ title, text: lines, url });
          setFlash("Shared");
          return;
        } catch {
          // User cancel or unsupported payload — fall through to clipboard.
        }
      }

      await navigator.clipboard.writeText(lines);
      setFlash("Link copied");
    } catch {
      setFlash("Share failed");
    } finally {
      setBusy(false);
    }
  }

  function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void shareProject();
  }

  if (!compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="text-primary text-sm font-semibold disabled:opacity-50"
      >
        Share
      </button>
    );
  }

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
            flash === "Share failed"
              ? "border-danger/40 bg-danger/15 text-danger"
              : "border-primary/40 bg-primary text-primaryFg",
          )}
        >
          {flash}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label="Share project"
        title="Share project link"
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
          "border-border bg-surfaceAlt/60 text-textMuted hover:text-text hover:border-border",
        )}
      >
        <Share2 className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
