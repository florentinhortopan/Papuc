"use client";

import {
  PROPERTY_TYPE_LABELS,
  ProjectConstraintsSchema,
  type ProjectConstraints,
  type PropertyType,
} from "@papuc/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DealCard } from "@/components/deal-card";
import {
  applyDealFilters,
  DealFiltersBar,
  DEFAULT_DEAL_FILTERS,
  homeTypeLabel,
  isAnyFilterActive,
  type DealFilters,
} from "@/components/deal-filters-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDeals, type DealWithScore } from "@/lib/deals";
import { deleteProject, updateProject, type ProjectRow } from "@/lib/projects";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

function rankByScore(deals: DealWithScore[]): DealWithScore[] {
  return [...deals].sort(
    (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
  );
}

/** Zillow homeType codes (as stored on deals) → our constraint enum. */
const HOME_TYPE_TO_PROPERTY_TYPE: Record<string, PropertyType> = {
  SINGLE_FAMILY: "single_family",
  CONDO: "condo",
  TOWNHOUSE: "townhouse",
  MULTI_FAMILY: "multi_family_2_4",
  APARTMENT: "multi_family_5_plus",
  MANUFACTURED: "manufactured",
  LOT: "land",
};

/** Everything the HasData/Zillow scout can actually search for. */
const ZILLOW_SEARCHABLE_TYPES: PropertyType[] = [
  "single_family",
  "condo",
  "townhouse",
  "multi_family_2_4",
  "multi_family_5_plus",
  "manufactured",
  "land",
];

export function ProjectDetailClient({
  project,
  initialDeals,
  initialLoadFailed = false,
}: {
  project: ProjectRow;
  initialDeals: DealWithScore[];
  /** True when the server-side deals read errored (deploy/transient). */
  initialLoadFailed?: boolean;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState<DealWithScore[]>(rankByScore(initialDeals));
  const [scouting, setScouting] = useState(false);
  const [scoutStatus, setScoutStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed);
  const [filters, setFilters] = useState<DealFilters>(DEFAULT_DEAL_FILTERS);
  const [savingFilters, setSavingFilters] = useState(false);
  const [filterSavedNote, setFilterSavedNote] = useState<string | null>(null);
  const projectIdRef = useRef(project.id);

  const visibleDeals = useMemo(
    () => applyDealFilters(deals, filters),
    [deals, filters],
  );
  // Mirror of `deals.length` readable inside stable callbacks without
  // recreating them (recreating refreshDeals used to churn the realtime
  // subscription on every deals change).
  const dealsCountRef = useRef(deals.length);
  dealsCountRef.current = deals.length;

  const refreshDeals = useCallback(async () => {
    const supabase = createClient();
    try {
      // Deal rows are permanent — nothing in the app deletes them short
      // of deleting the whole project. So a *successful but empty* read
      // can only mean the request ran without an authenticated session
      // (RLS silently filters every row instead of erroring, e.g. while
      // the auth token is mid-refresh right after a navigation). Never
      // let that wipe a populated grid; treat it like a failed load.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("session not ready");
      const d = await listDeals(supabase, project.id);
      if (d.length === 0 && dealsCountRef.current > 0) {
        throw new Error("empty read while grid populated (RLS/session race)");
      }
      setDeals(rankByScore(d));
      setLoadFailed(false);
      return d.length;
    } catch (err) {
      // Keep whatever is currently rendered; flag the failure only when
      // there's nothing on screen, so the empty state offers a retry
      // instead of a misleading "no deals yet".
      console.warn("[project] deals refresh skipped:", err);
      setLoadFailed(dealsCountRef.current === 0);
      return null;
    }
  }, [project.id]);

  // Always re-read on mount. Deals live in the DB, so navigating back to
  // this page must never depend on a single server-render fetch having
  // succeeded (a mid-deploy hiccup used to leave an empty grid that made
  // users re-scout data they already had). If the grid is still empty on
  // a project that HAS scouted before, retry with backoff — the empty
  // result is far more likely a session/connection race than real.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void refreshDeals().then((count) => {
      if (cancelled || count === null || count > 0 || !project.last_scout_at) {
        return;
      }
      for (const delayMs of [1500, 5000]) {
        timers.push(
          setTimeout(() => {
            if (!cancelled && dealsCountRef.current === 0) void refreshDeals();
          }, delayMs),
        );
      }
    });
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    projectIdRef.current = project.id;
    const supabase = createClient();
    const channel = supabase
      .channel(`project:${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          if (projectIdRef.current === project.id) void refreshDeals();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deal_scores",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          if (projectIdRef.current === project.id) void refreshDeals();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [project.id, refreshDeals]);

  async function runScout() {
    setError(null);
    setScouting(true);
    setScoutStatus("Scouting…");
    try {
      const res = await fetch(`/api/projects/${project.id}/scout`, {
        method: "POST",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `scout failed (${res.status})`);
      }
      const json = (await res.json()) as {
        candidatesSeen: number;
        dealsAdded: number;
        diagnostics?: {
          provider?: string;
          unsupportedPropertyTypes?: string[];
        };
      };
      const unsupported = json.diagnostics?.unsupportedPropertyTypes ?? [];
      const baseMessage = `Saw ${json.candidatesSeen} candidates · ${json.dealsAdded} match your goals`;
      setScoutStatus(
        unsupported.length
          ? `${baseMessage} · ${formatUnsupportedHint(unsupported)}`
          : baseMessage,
      );
      await refreshDeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScoutStatus(null);
    } finally {
      setScouting(false);
    }
  }

  /**
   * Translate the active grid filters into project constraints so future
   * scouts enforce them at the source: API-level filters (price, beds,
   * HOA, property types) narrow the search itself; financial floors
   * (cashflow, DSCR) drop non-qualifying candidates before they're saved.
   */
  async function saveFiltersToProject() {
    setSavingFilters(true);
    setFilterSavedNote(null);
    setError(null);
    try {
      const c = project.constraints;
      const next: ProjectConstraints = {
        ...c,
        propertyTypes: [...c.propertyTypes],
      };
      const applied: string[] = [];

      const minCashflow = Number(filters.minCashflow);
      if (minCashflow > 0) {
        next.targetMonthlyCashflow = minCashflow;
        applied.push(`cashflow ≥ ${formatMoney(minCashflow)}/mo`);
      }
      const minDscr = Number(filters.minDscr);
      if (minDscr > 0) {
        next.minDSCR = Math.min(3, minDscr);
        applied.push(`DSCR ≥ ${next.minDSCR.toFixed(2)}`);
      }
      const maxPrice = Number(filters.maxPrice);
      if (maxPrice > 0) {
        next.priceMax = maxPrice;
        applied.push(`price ≤ ${formatMoney(maxPrice)}`);
      }
      const minBeds = Number(filters.minBeds);
      if (minBeds > 0) {
        next.bedsMin = Math.round(minBeds);
        applied.push(`≥ ${next.bedsMin} bd`);
      }
      if (filters.noHoa) {
        next.hoaMax = 0;
        applied.push("no HOA");
      }
      if (filters.excludedTypes.length > 0) {
        const excluded = new Set(
          filters.excludedTypes
            .map((t) => HOME_TYPE_TO_PROPERTY_TYPE[t])
            .filter((t): t is PropertyType => t !== undefined),
        );
        // "any" is an implicit include-all; make it explicit so we can
        // subtract from it.
        const base: PropertyType[] =
          c.propertyTypes.length === 0 || c.propertyTypes.includes("any")
            ? ZILLOW_SEARCHABLE_TYPES
            : c.propertyTypes;
        const kept = base.filter((t) => !excluded.has(t));
        if (kept.length === 0) {
          throw new Error(
            "These filters would exclude every property type — keep at least one.",
          );
        }
        next.propertyTypes = kept;
        applied.push(
          `excluding ${filters.excludedTypes.map(homeTypeLabel).join(", ")}`,
        );
      }

      if (applied.length === 0) return;
      const validated = ProjectConstraintsSchema.parse(next);
      const supabase = createClient();
      await updateProject(supabase, project.id, { constraints: validated });
      setFilterSavedNote(
        `Saved to project: ${applied.join(" · ")}. Hit "Scout deals" to re-run with these rules.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingFilters(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        "Delete this project? This removes the project and all scouted deals.",
      )
    ) {
      return;
    }
    try {
      const supabase = createClient();
      await deleteProject(supabase, project.id);
      router.push("/projects");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const c = project.constraints;
  const marketLabel = formatMarket(c.markets[0]);

  return (
    <div className="mt-2">
      <h1 className="text-3xl font-bold">{project.name}</h1>
      <p className="text-textMuted text-sm mt-1">{marketLabel}</p>

      <div className="bg-surface border border-border rounded-2xl p-4 mt-4 mb-4">
        <p className="text-textMuted text-xs mb-2">Constraints</p>
        <div className="flex flex-wrap gap-2">
          <Badge>{c.strategy}</Badge>
          {c.propertyTypes
            .filter((t) => t !== "any")
            .map((t) => (
              <Badge key={t}>{PROPERTY_TYPE_LABELS[t]}</Badge>
            ))}
          {c.priceMax ? <Badge>≤ {formatMoney(c.priceMax)}</Badge> : null}
          {c.bedsMin ? <Badge>≥ {c.bedsMin} bd</Badge> : null}
          {c.bedsMax ? <Badge>≤ {c.bedsMax} bd</Badge> : null}
          {c.bathsMin ? <Badge>≥ {c.bathsMin} ba</Badge> : null}
          {c.sqftMin ? <Badge>≥ {c.sqftMin} sqft</Badge> : null}
          {c.lotSizeMinSqft ? (
            <Badge>≥ {Math.round((c.lotSizeMinSqft / 43_560) * 100) / 100} ac</Badge>
          ) : null}
          {c.yearBuiltMin ? <Badge>Built ≥ {c.yearBuiltMin}</Badge> : null}
          {c.daysOnMarketMax ? <Badge>Listed ≤ {c.daysOnMarketMax}</Badge> : null}
          {c.downPayment ? (
            <Badge>Down {formatMoney(c.downPayment)}</Badge>
          ) : null}
          {c.targetMonthlyCashflow ? (
            <Badge>{formatMoney(c.targetMonthlyCashflow)}/mo</Badge>
          ) : null}
          <Badge>DSCR ≥ {c.minDSCR.toFixed(2)}</Badge>
          <Badge>{(c.mortgage.rateAPR * 100).toFixed(2)}% APR</Badge>
        </div>
        {project.last_scout_at ? (
          <p className="text-textMuted text-xs mt-3">
            Last scout {formatDate(project.last_scout_at)}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button onClick={runScout} loading={scouting} className="flex-1 sm:flex-none">
          {scouting ? "Scouting…" : "Scout deals"}
        </Button>
      </div>
      {scoutStatus ? (
        <p className="text-textMuted text-xs mt-2">{scoutStatus}</p>
      ) : null}
      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mt-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}

      <h2 className="text-lg font-semibold mt-8 mb-3">
        Deals{" "}
        {deals.length
          ? visibleDeals.length !== deals.length
            ? `(${visibleDeals.length} of ${deals.length})`
            : `(${deals.length})`
          : ""}
      </h2>
      {deals.length > 0 ? (
        <DealFiltersBar
          deals={deals}
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            setFilterSavedNote(null);
          }}
          shownCount={visibleDeals.length}
          onSaveToProject={() => void saveFiltersToProject()}
          saving={savingFilters}
          savedNote={filterSavedNote}
        />
      ) : null}
      {deals.length > 0 && deals.every((d) => !d.price) ? (
        <div className="bg-surface border border-border rounded-xl p-3 mb-3">
          <p className="text-textMuted text-xs leading-5">
            <span className="text-text font-semibold">Off-market data only.</span>{" "}
            None of these candidates are currently listed on MLS — you're seeing
            property records ranked by AVM-based DSCR fit. Active for-sale data
            requires upgrading RealEstateAPI from pay-as-you-go to Starter, or
            switching providers.
          </p>
        </div>
      ) : null}
      {deals.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          {loadFailed || project.last_scout_at ? (
            <>
              <p className="text-textMuted text-sm">
                {loadFailed
                  ? "Couldn't load your scouted deals — they're still saved, this is just a connection hiccup. No need to re-scout."
                  : "This project has scouted before and deals never expire, so if you expected results here, refresh instead of re-scouting. (An empty grid is also normal when the last scout matched nothing.)"}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void refreshDeals()}
              >
                Refresh deals
              </Button>
            </>
          ) : (
            <p className="text-textMuted text-sm">
              No deals yet. Click "Scout deals" to find listings that match
              your goals.
            </p>
          )}
        </div>
      ) : visibleDeals.length === 0 && isAnyFilterActive(filters) ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-textMuted text-sm">
            No deals match the current filters ({deals.length} hidden).
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() =>
              setFilters({ ...DEFAULT_DEAL_FILTERS, sort: filters.sort })
            }
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleDeals.map((deal) => (
            <DealCard key={deal.id} deal={deal} strategy={project.constraints.strategy} />
          ))}
        </div>
      )}

      <div className="mt-12">
        <button
          type="button"
          onClick={onDelete}
          className="text-danger text-sm font-semibold hover:underline"
        >
          Delete project
        </button>
      </div>
    </div>
  );
}

/**
 * Render a "your X / Y selection isn't covered by this provider" hint
 * using human-readable labels so users without a PropertyType cheat
 * sheet still understand what was skipped.
 */
function formatUnsupportedHint(types: string[]): string {
  const labels = types.map(
    (t) =>
      (PROPERTY_TYPE_LABELS as Record<string, string | undefined>)[t] ?? t,
  );
  const list = labels.join(" / ");
  return `${list} not searchable on Zillow — try RealEstateAPI for these.`;
}
