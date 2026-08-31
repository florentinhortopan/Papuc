"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

import type { ProjectListItem } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * Share a project via a public /share/p/[token] link so messengers can
 * unfurl OG image + compact title. Keep Web Share payload short — long
 * text (esp. voice transcripts) kills the preview card.
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
      let shareUrl: string | null = null;
      try {
        const res = await fetch(`/api/projects/${project.id}/share`, {
          method: "POST",
        });
        if (res.ok) {
          const body = (await res.json()) as { url?: string };
          shareUrl = body.url ?? null;
        }
      } catch {
        /* fall through */
      }

      const title = project.name;

      const url =
        shareUrl ??
        `${typeof window !== "undefined" ? window.location.origin : ""}/projects/${project.id}`;

      const nav = (typeof navigator !== "undefined" ? navigator : null) as
        | (Navigator & {
            share?: (data: {
              title?: string;
              text?: string;
              url?: string;
            }) => Promise<void>;
          })
        | null;

      if (nav?.share && shareUrl) {
        try {
          // URL only — do not pass `text` (WhatsApp glues it onto the path).
          await nav.share({ title, url: shareUrl });
          setFlash("Shared — they can Follow you");
          return;
        } catch {
          // User cancel or unsupported payload — fall through to clipboard.
        }
      }

      await navigator.clipboard.writeText(url);
      setFlash("Copied — they can Follow you");
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
