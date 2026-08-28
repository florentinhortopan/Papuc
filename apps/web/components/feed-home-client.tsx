"use client";

import { Loader2, Mic, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FeedDealCard } from "@/components/feed-deal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  VoiceConcierge,
  VoiceConciergeTrigger,
} from "@/components/voice-concierge";
import {
  dealsForChip,
  FEED_CHIPS,
  type FeedChip,
  type FeedDeal,
  type PersonalizedFeed,
} from "@/lib/feed";
import {
  deleteDealAction,
  postDealAction,
} from "@/lib/deal-actions-client";
import { errorMessage } from "@/lib/error-message";
import { formatMarket } from "@/lib/format";
import type { ProjectConstraints } from "@papuc/core";

type SearchResult = {
  deals: FeedDeal[];
  constraints: ProjectConstraints;
  prompt: string;
};

export function FeedHomeClient({
  initialFeed,
  projectCount = 0,
  initialLoadError = null,
}: {
  initialFeed: PersonalizedFeed;
  projectCount?: number;
  initialLoadError?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const talkOpened = useRef(false);
  const [feed, setFeed] = useState(initialFeed);
  const [chip, setChip] = useState<FeedChip>("for_you");
  const [prompt, setPrompt] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);

  const firstRun = projectCount === 0;

  useEffect(() => {
    if (talkOpened.current) return;
    if (searchParams.get("talk") !== "1") return;
    talkOpened.current = true;
    setVoiceOpen(true);
    router.replace("/home", { scroll: false });
  }, [searchParams, router]);

  const savedIds = useMemo(
    () => new Set(feed.saved.map((d) => d.id)),
    [feed.saved],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      const json = (await res.json()) as PersonalizedFeed & { error?: unknown };
      if (!res.ok) {
        setLoadError(errorMessage(json.error ?? `Feed failed (${res.status})`));
        return;
      }
      setLoadError(null);
      setFeed(json);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function removeDealLocally(dealId: string) {
    const drop = (list: FeedDeal[]) => list.filter((d) => d.id !== dealId);
    setFeed((prev) => ({
      ...prev,
      forYou: drop(prev.forYou),
      newForYou: drop(prev.newForYou),
      basedOnSearches: drop(prev.basedOnSearches),
      bestRated: drop(prev.bestRated),
      mostProfitable: drop(prev.mostProfitable),
      saved: drop(prev.saved),
      friends: drop(prev.friends),
    }));
    setSearchResult((prev) =>
      prev
        ? { ...prev, deals: prev.deals.filter((d) => d.id !== dealId) }
        : prev,
    );
  }

  async function onSave(deal: FeedDeal) {
    setBusyId(deal.id);
    setActionError(null);
    setActionNote(null);
    try {
      await postDealAction(deal.id, deal.project.id, "saved");
      setFeed((prev) => {
        const withoutSkip = prev.skipped.filter((d) => d.id !== deal.id);
        if (prev.saved.some((d) => d.id === deal.id)) {
          return { ...prev, skipped: withoutSkip };
        }
        return {
          ...prev,
          skipped: withoutSkip,
          saved: [deal, ...prev.saved],
        };
      });
      setActionNote("Saved — find it under Saved or in Portfolio.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onSkip(deal: FeedDeal) {
    setBusyId(deal.id);
    setActionError(null);
    setActionNote(null);
    try {
      await postDealAction(deal.id, deal.project.id, "dismissed");
      setFeed((prev) => ({
        ...prev,
        saved: prev.saved.filter((d) => d.id !== deal.id),
        skipped: prev.skipped.some((d) => d.id === deal.id)
          ? prev.skipped
          : [deal, ...prev.skipped],
      }));
      removeDealLocally(deal.id);
      setActionNote("Skipped — restore anytime from the Skipped chip.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onUnskip(deal: FeedDeal) {
    setBusyId(deal.id);
    setActionError(null);
    setActionNote(null);
    try {
      await deleteDealAction(deal.id, "dismissed");
      setFeed((prev) => ({
        ...prev,
        skipped: prev.skipped.filter((d) => d.id !== deal.id),
      }));
      setActionNote("Restored — it can show in For you again.");
      void refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onUnsave(deal: FeedDeal) {
    setBusyId(deal.id);
    setActionError(null);
    setActionNote(null);
    try {
      await deleteDealAction(deal.id, "saved");
      setFeed((prev) => ({
        ...prev,
        saved: prev.saved.filter((d) => d.id !== deal.id),
      }));
      setActionNote("Removed from Saved.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = prompt.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/feed/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      const json = (await res.json()) as {
        kind?: "deal" | "property_miss" | "feed";
        deals?: FeedDeal[];
        constraints?: ProjectConstraints;
        prompt?: string;
        dealId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `search ${res.status}`);

      if (json.kind === "deal" && json.dealId) {
        router.push(`/deals/${json.dealId}`);
        return;
      }
      if (json.kind === "property_miss") {
        setSearchError(
          json.error ??
            "Couldn’t find that property. Try a fuller address, a listing link, or a broader search.",
        );
        return;
      }

      setSearchResult({
        deals: json.deals ?? [],
        constraints: json.constraints!,
        prompt: json.prompt ?? q,
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchResult(null);
    setSearchError(null);
    setPrompt("");
  }

  const chipDeals = dealsForChip(feed, chip);
  const poolEmpty =
    feed.forYou.length === 0 &&
    feed.bestRated.length === 0 &&
    feed.saved.length === 0;
  // Friends empty must never count as Discover empty.
  const socialNote = feed.socialError ?? null;

  const tasteLine =
    feed.taste && feed.taste.marketLabels.length
      ? `Learning from ${feed.taste.projectCount} project${feed.taste.projectCount === 1 ? "" : "s"} · ${feed.taste.marketLabels.slice(0, 3).join(" · ")}`
      : feed.taste
        ? `Learning from ${feed.taste.projectCount} project${feed.taste.projectCount === 1 ? "" : "s"}`
        : "Scout a project to personalize For you";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discover deals</h1>
        <p className="text-textMuted text-sm mt-1">{tasteLine}</p>
        <p className="text-textMuted text-[11px] mt-1">
          Heart = Saved (also in{" "}
          <Link href="/portfolio" className="text-primary hover:underline">
            Portfolio
          </Link>
          ). X = Skipped (hidden from For you).
        </p>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="text-danger text-sm font-medium">
            Couldn&apos;t load Discover
          </p>
          <p className="text-danger/90 text-xs mt-1 break-all">{loadError}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-primary text-xs mt-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {socialNote && !loadError ? (
        <div className="rounded-2xl border border-border bg-surfaceAlt/60 px-4 py-2">
          <p className="text-textMuted text-xs">
            Your deals loaded; Friends/public enrichment had an issue:{" "}
            <span className="break-all">{socialNote}</span>
          </p>
        </div>
      ) : null}

      {firstRun ? (
        <div className="rounded-3xl border border-primary/30 bg-primary/10 p-6 sm:p-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-2">
            Papuc Concierge
          </p>
          <h2 className="text-2xl font-bold text-text mb-2">
            Talk through what you want
          </h2>
          <p className="text-textMuted text-sm max-w-md mx-auto mb-5">
            A short voice call — rant freely, we listen carefully, then turn it
            into your first scout project.
          </p>
          <Button
            type="button"
            onClick={() => setVoiceOpen(true)}
            className="inline-flex items-center gap-2"
          >
            <Mic className="h-4 w-4" />
            Talk to Papuc
          </Button>
          <p className="text-textMuted text-[11px] mt-3">
            Or{" "}
            <Link href="/projects/new" className="text-primary hover:underline">
              type a project
            </Link>{" "}
            instead.
          </p>
        </div>
      ) : null}

      <form onSubmit={onSearch} className="relative">
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface shadow-sm px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 text-textMuted shrink-0" aria-hidden />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask for deals — or paste a listing URL / street address"
            className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder:text-textMuted outline-none"
            disabled={searching}
            aria-label="AI deal search"
          />
          <VoiceConciergeTrigger onClick={() => setVoiceOpen(true)} />
          <button
            type="submit"
            disabled={searching || !prompt.trim()}
            className="shrink-0 rounded-full bg-primary text-primaryFg text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Ask"
            )}
          </button>
        </div>
        {searchError ? (
          <p className="text-danger text-xs mt-2">{searchError}</p>
        ) : null}
      </form>

      <VoiceConcierge
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        variant={firstRun ? "first_run" : "ongoing"}
        completionMode="create"
      />

      {actionError ? (
        <p className="text-danger text-xs">{actionError}</p>
      ) : actionNote ? (
        <p className="text-success text-xs">{actionNote}</p>
      ) : null}

      {!searchResult ? (
        <div
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
          role="tablist"
          aria-label="Feed filters"
        >
          {FEED_CHIPS.map((c) => {
            const active = chip === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setChip(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-primary text-primaryFg border-primary"
                    : "bg-surface border-border text-textMuted hover:text-text hover:border-border/80"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {searchResult ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">Matches for your search</h2>
              <p className="text-textMuted text-xs mt-0.5 truncate">
                “{searchResult.prompt}”
              </p>
              <ConstraintChips constraints={searchResult.constraints} />
            </div>
            <button
              type="button"
              onClick={clearSearch}
              className="text-primary text-xs hover:underline shrink-0"
            >
              Clear
            </button>
          </div>
          {searchResult.deals.length === 0 ? (
            <p className="text-textMuted text-sm">
              No deals matched. Try a broader prompt, or scout a project in
              that market.
            </p>
          ) : (
            <DealGrid
              deals={searchResult.deals}
              busyId={busyId}
              savedIds={savedIds}
              onSave={onSave}
              onSkip={onSkip}
              onUnsave={onUnsave}
            />
          )}
        </div>
      ) : chip === "for_you" ? (
        <>
          {poolEmpty ? (
            <EmptyFeed />
          ) : (
            <div className="space-y-8">
              <FeedSection
                title="New for you"
                deals={feed.newForYou}
                busyId={busyId}
                savedIds={savedIds}
                onSave={onSave}
                onSkip={onSkip}
                onUnsave={onUnsave}
                empty="Nothing new in the last 48 hours — run Scout or Nightly to refill."
              />
              <FeedSection
                title="Based on your searches"
                deals={feed.basedOnSearches}
                busyId={busyId}
                savedIds={savedIds}
                onSave={onSave}
                onSkip={onSkip}
                onUnsave={onUnsave}
                empty="Scout a project so we can learn your markets and filters."
              />
              <FeedSection
                title="Best rated"
                deals={feed.bestRated}
                busyId={busyId}
                savedIds={savedIds}
                onSave={onSave}
                onSkip={onSkip}
                onUnsave={onUnsave}
              />
              <FeedSection
                title="Most profitable"
                deals={feed.mostProfitable}
                busyId={busyId}
                savedIds={savedIds}
                onSave={onSave}
                onSkip={onSkip}
                onUnsave={onUnsave}
              />
              <FeedSection
                title="Friends' deals"
                deals={feed.friends}
                busyId={busyId}
                savedIds={savedIds}
                onSave={onSave}
                onSkip={onSkip}
                onUnsave={onUnsave}
                empty="Follow investors or watch a public scout to fill Friends."
              />
            </div>
          )}
        </>
      ) : chip === "friends" ? (
        chipDeals.length === 0 ? (
          <div className="py-6 space-y-3 max-w-lg">
            <p className="text-text font-semibold">No friends deals yet</p>
            <p className="text-textMuted text-sm">
              Friends only shows deals from investors you Follow or scouts you
              Watch — and only when those projects have{" "}
              <span className="text-text">Show on Discover</span> on.
            </p>
            <ol className="text-textMuted text-sm list-decimal pl-5 space-y-1">
              <li>
                Open a public deal on Discover (or someone&apos;s shared project
                link).
              </li>
              <li>Tap Follow on the investor, or Watch on the project.</li>
              <li>New public finds from them land in this Friends chip.</li>
            </ol>
            <p className="text-textMuted text-xs">
              Tip: turn on Show on Discover on your own projects so others can
              follow you back.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Friends</h2>
            <p className="text-textMuted text-xs">
              Deals from people you follow and scouts you watch.
            </p>
            <DealGrid
              deals={chipDeals}
              busyId={busyId}
              savedIds={savedIds}
              onSave={onSave}
              onSkip={onSkip}
              onUnsave={onUnsave}
            />
          </div>
        )
      ) : chip === "skipped" ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Skipped</h2>
          <p className="text-textMuted text-xs">
            Deals you tapped X on. Restore to let them show in For you again.
          </p>
          {chipDeals.length === 0 ? (
            <p className="text-textMuted text-sm">No skipped deals yet.</p>
          ) : (
            <DealGrid
              deals={chipDeals}
              busyId={busyId}
              savedIds={savedIds}
              mode="skipped"
              onSave={onSave}
              onSkip={onSkip}
              onUnsave={onUnsave}
              onUnskip={onUnskip}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {FEED_CHIPS.find((c) => c.id === chip)?.label}
          </h2>
          {chip === "saved" ? (
            <p className="text-textMuted text-xs">
              Also listed under{" "}
              <Link href="/portfolio" className="text-primary hover:underline">
                Portfolio
              </Link>{" "}
              for side-by-side compare.
            </p>
          ) : null}
          {chipDeals.length === 0 ? (
            <p className="text-textMuted text-sm">
              {chip === "saved"
                ? "No saved deals yet — tap the heart on a card."
                : chip === "new"
                  ? "No fresh listings in the last 48 hours."
                  : "Nothing here yet. Scout a project to fill the feed."}
            </p>
          ) : (
            <DealGrid
              deals={chipDeals}
              busyId={busyId}
              savedIds={savedIds}
              mode={chip === "saved" ? "saved" : "default"}
              onSave={onSave}
              onSkip={onSkip}
              onUnsave={onUnsave}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="bg-surface border border-border rounded-2xl p-8 text-center">
      <p className="text-text font-semibold mb-1">No scouted deals yet</p>
      <p className="text-textMuted text-sm mb-4 max-w-md mx-auto">
        Discover is built from <span className="text-text">your</span> projects
        first. Scout a project and deals land here automatically — Friends is a
        separate rail after you Follow or Watch someone.
      </p>
      <Link href="/projects" className="text-primary text-sm hover:underline">
        Go to projects →
      </Link>
    </div>
  );
}

function ConstraintChips({ constraints }: { constraints: ProjectConstraints }) {
  const chips: string[] = [];
  const market = constraints.markets[0];
  if (market) chips.push(formatMarket(market));
  chips.push(constraints.strategy);
  if (constraints.priceMax)
    chips.push(`≤ $${Math.round(constraints.priceMax).toLocaleString()}`);
  if (constraints.bedsMin != null) chips.push(`${constraints.bedsMin}+ bd`);
  if (constraints.minDSCR)
    chips.push(`DSCR ≥ ${constraints.minDSCR.toFixed(2)}`);
  if (constraints.targetMonthlyCashflow) {
    chips.push(`~$${Math.round(constraints.targetMonthlyCashflow)}/mo`);
  }
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map((c) => (
        <Badge key={c}>{c}</Badge>
      ))}
    </div>
  );
}

function DealGrid({
  deals,
  busyId,
  savedIds,
  mode = "default",
  onSave,
  onSkip,
  onUnsave,
  onUnskip,
}: {
  deals: FeedDeal[];
  busyId: string | null;
  savedIds: Set<string>;
  mode?: "default" | "saved" | "skipped";
  onSave: (d: FeedDeal) => void;
  onSkip: (d: FeedDeal) => void;
  onUnsave: (d: FeedDeal) => void;
  onUnskip?: (d: FeedDeal) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {deals.map((deal) => (
        <FeedDealCard
          key={deal.id}
          deal={deal}
          className="w-full min-w-0"
          busy={busyId === deal.id}
          saved={savedIds.has(deal.id)}
          onSave={
            mode === "skipped"
              ? undefined
              : () => (savedIds.has(deal.id) ? onUnsave(deal) : onSave(deal))
          }
          onSkip={
            mode === "skipped"
              ? onUnskip
                ? () => onUnskip(deal)
                : undefined
              : () => onSkip(deal)
          }
          skipLabel={mode === "skipped" ? "Restore" : undefined}
        />
      ))}
    </div>
  );
}

function FeedSection({
  title,
  deals,
  empty,
  busyId,
  savedIds,
  onSave,
  onSkip,
  onUnsave,
}: {
  title: string;
  deals: FeedDeal[];
  empty?: string;
  busyId: string | null;
  savedIds: Set<string>;
  onSave: (d: FeedDeal) => void;
  onSkip: (d: FeedDeal) => void;
  onUnsave: (d: FeedDeal) => void;
}) {
  if (deals.length === 0) {
    return (
      <section>
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-textMuted text-sm">{empty ?? "Nothing here yet."}</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
        {deals.map((deal) => (
          <FeedDealCard
            key={`${title}-${deal.id}`}
            deal={deal}
            busy={busyId === deal.id}
            saved={savedIds.has(deal.id)}
            onSave={() =>
              savedIds.has(deal.id) ? onUnsave(deal) : onSave(deal)
            }
            onSkip={() => onSkip(deal)}
          />
        ))}
      </div>
    </section>
  );
}
