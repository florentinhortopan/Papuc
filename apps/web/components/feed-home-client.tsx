"use client";

import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FeedDealCard } from "@/components/feed-deal-card";
import { Badge } from "@/components/ui/badge";
import { formatMarket } from "@/lib/format";
import type { FeedDeal, FeedSections } from "@/lib/feed";
import type { ProjectConstraints } from "@papuc/core";

type SearchResult = {
  deals: FeedDeal[];
  constraints: ProjectConstraints;
  prompt: string;
};

export function FeedHomeClient({
  initialSections,
}: {
  initialSections: FeedSections;
}) {
  const [sections, setSections] = useState(initialSections);
  const [prompt, setPrompt] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as FeedSections;
      setSections(json);
    } catch {
      /* keep initial */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const poolEmpty =
    sections.bestRated.length === 0 &&
    sections.mostProfitable.length === 0 &&
    sections.latest.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discover deals</h1>
        <p className="text-textMuted text-sm mt-1">
          Best-rated and most profitable listings from public Papuc projects.
        </p>
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
              No public deals matched. Try a broader prompt, or make a project
              public so its deals appear here.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {searchResult.deals.map((deal) => (
                <FeedDealCard
                  key={deal.id}
                  deal={deal}
                  className="w-full min-w-0"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {poolEmpty ? (
            <div className="bg-surface border border-border rounded-2xl p-8 text-center">
              <p className="text-text font-semibold mb-1">No public deals yet</p>
              <p className="text-textMuted text-sm mb-4">
                Make a project public from its settings so scouted listings show
                up on the home feed for everyone.
              </p>
              <Link
                href="/projects"
                className="text-primary text-sm hover:underline"
              >
                Go to projects →
              </Link>
            </div>
          ) : null}

          <FeedSection title="Best rated" deals={sections.bestRated} />
          <FeedSection title="Most profitable" deals={sections.mostProfitable} />
          <FeedSection title="Latest deals" deals={sections.latest} />
          <FeedSection
            title="Friends' deals"
            deals={[]}
            stub="Coming soon — follow investors and see deals they make public."
          />
        </>
      )}
    </div>
  );
}

function ConstraintChips({ constraints }: { constraints: ProjectConstraints }) {
  const chips: string[] = [];
  const market = constraints.markets[0];
  if (market) chips.push(formatMarket(market));
  chips.push(constraints.strategy);
  if (constraints.priceMax) chips.push(`≤ $${Math.round(constraints.priceMax).toLocaleString()}`);
  if (constraints.bedsMin != null) chips.push(`${constraints.bedsMin}+ bd`);
  if (constraints.minDSCR) chips.push(`DSCR ≥ ${constraints.minDSCR.toFixed(2)}`);
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

function FeedSection({
  title,
  deals,
  stub,
}: {
  title: string;
  deals: FeedDeal[];
  stub?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {deals.length > 0 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label={`Scroll ${title} left`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text hover:bg-surfaceAlt"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label={`Scroll ${title} right`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text hover:bg-surfaceAlt"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      {deals.length === 0 ? (
        <p className="text-textMuted text-sm">
          {stub ?? "Nothing here yet."}
        </p>
      ) : (
        <div
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin"
        >
          {deals.map((deal) => (
            <FeedDealCard key={`${title}-${deal.id}`} deal={deal} />
          ))}
        </div>
      )}
    </section>
  );
}
