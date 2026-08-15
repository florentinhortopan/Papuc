"use client";

import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FeedDealCard } from "@/components/feed-deal-card";
import { Badge } from "@/components/ui/badge";
import { actOnDeal, clearDealAction } from "@/lib/deals";
import {
  dealsForChip,
  FEED_CHIPS,
  type FeedChip,
  type FeedDeal,
  type PersonalizedFeed,
} from "@/lib/feed";
import { formatMarket } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ProjectConstraints } from "@papuc/core";

type SearchResult = {
  deals: FeedDeal[];
  constraints: ProjectConstraints;
  prompt: string;
};

export function FeedHomeClient({
  initialFeed,
}: {
  initialFeed: PersonalizedFeed;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [chip, setChip] = useState<FeedChip>("for_you");
  const [prompt, setPrompt] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as PersonalizedFeed;
      setFeed(json);
    } catch {
      /* keep initial */
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
    try {
      const supabase = createClient();
      await clearDealAction(supabase, {
        dealId: deal.id,
        action: "dismissed",
      }).catch(() => undefined);
      await actOnDeal(supabase, {
        dealId: deal.id,
        projectId: deal.project.id,
        action: "saved",
      });
      setFeed((prev) => {
        if (prev.saved.some((d) => d.id === deal.id)) return prev;
        return { ...prev, saved: [deal, ...prev.saved] };
      });
    } catch (err) {
      console.warn("[feed] save failed", err);
    } finally {
      setBusyId(null);
    }
  }

  async function onSkip(deal: FeedDeal) {
    setBusyId(deal.id);
    try {
      const supabase = createClient();
      await actOnDeal(supabase, {
        dealId: deal.id,
        projectId: deal.project.id,
        action: "dismissed",
      });
      removeDealLocally(deal.id);
    } catch (err) {
      console.warn("[feed] skip failed", err);
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
      const json = (await res.json()) as SearchResult & { error?: string };
      if (!res.ok) throw new Error(json.error || `search ${res.status}`);
      setSearchResult({
        deals: json.deals ?? [],
        constraints: json.constraints,
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
      </div>

      <form onSubmit={onSearch} className="relative">
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface shadow-sm px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 text-textMuted shrink-0" aria-hidden />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Find cashflowing 3beds near Austin under $500k…"
            className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder:text-textMuted outline-none"
            disabled={searching}
            aria-label="AI deal search"
          />
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
              onSave={onSave}
              onSkip={onSkip}
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
                onSave={onSave}
                onSkip={onSkip}
                empty="Nothing new in the last 48 hours — run Scout or Nightly to refill."
              />
              <FeedSection
                title="Based on your searches"
                deals={feed.basedOnSearches}
                busyId={busyId}
                onSave={onSave}
                onSkip={onSkip}
                empty="Scout a project so we can learn your markets and filters."
              />
              <FeedSection
                title="Best rated"
                deals={feed.bestRated}
                busyId={busyId}
                onSave={onSave}
                onSkip={onSkip}
              />
              <FeedSection
                title="Most profitable"
                deals={feed.mostProfitable}
                busyId={busyId}
                onSave={onSave}
                onSkip={onSkip}
              />
              <FeedSection
                title="Friends' deals"
                deals={feed.friends}
                busyId={busyId}
                onSave={onSave}
                onSkip={onSkip}
                empty="Coming soon — follow investors and see deals they make public."
              />
            </div>
          )}
        </>
      ) : chip === "friends" ? (
        <p className="text-textMuted text-sm py-6">
          Coming soon — follow investors and see deals they make public.
        </p>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {FEED_CHIPS.find((c) => c.id === chip)?.label}
          </h2>
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
              onSave={onSave}
              onSkip={onSkip}
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
      <p className="text-text font-semibold mb-1">Your feed is empty</p>
      <p className="text-textMuted text-sm mb-4">
        Scout a project to pull deals that match your goals — they show up here
        automatically. Public projects from other investors expand the shelf.
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
  onSave,
  onSkip,
}: {
  deals: FeedDeal[];
  busyId: string | null;
  onSave: (d: FeedDeal) => void;
  onSkip: (d: FeedDeal) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {deals.map((deal) => (
        <FeedDealCard
          key={deal.id}
          deal={deal}
          className="w-full min-w-0"
          busy={busyId === deal.id}
          onSave={() => onSave(deal)}
          onSkip={() => onSkip(deal)}
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
  onSave,
  onSkip,
}: {
  title: string;
  deals: FeedDeal[];
  empty?: string;
  busyId: string | null;
  onSave: (d: FeedDeal) => void;
  onSkip: (d: FeedDeal) => void;
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
            onSave={() => onSave(deal)}
            onSkip={() => onSkip(deal)}
          />
        ))}
      </div>
    </section>
  );
}
