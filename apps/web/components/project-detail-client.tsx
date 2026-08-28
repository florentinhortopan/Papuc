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
import { ConstraintReview } from "@/components/constraint-review";
import {
  applyDealFilters,
  DealFiltersBar,
  DEFAULT_DEAL_FILTERS,
  homeTypeLabel,
  isAnyFilterActive,
  type DealFilters,
} from "@/components/deal-filters-bar";
import { ImportListingPanel } from "@/components/import-listing-panel";
import { NightlyScoutToggle } from "@/components/nightly-scout-toggle";
import { PublicFeedToggle } from "@/components/public-feed-toggle";
import { FollowButton } from "@/components/follow-button";
import { WatchProjectButton } from "@/components/watch-project-button";
import { ProLockedPanel } from "@/components/pro-locked-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ScoutMode, SubscriptionTier } from "@/lib/database.types";
import {
  deleteDealAction,
  postDealAction,
} from "@/lib/deal-actions-client";
import { listDeals, type DealWithScore } from "@/lib/deals";
import { deleteProject, updateProject, type ProjectRow } from "@/lib/projects";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import {
  formatScoutedAgo,
  isScoutWithinCooldown,
} from "@/lib/scout-freshness";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type DealShelf = "live" | "archived" | "all";

const SHELF_CHIPS: Array<{ id: DealShelf; label: string }> = [
  { id: "live", label: "Live" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

function rankByScore(deals: DealWithScore[]): DealWithScore[] {
  return [...deals].sort(
    (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
  );
}

type DealStatusChip = "all" | "saved" | "skipped";

const STATUS_CHIPS: Array<{ id: DealStatusChip; label: string }> = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "skipped", label: "Skipped" },
];

function dealsForStatusChip(
  deals: DealWithScore[],
  chip: DealStatusChip,
): DealWithScore[] {
  if (chip === "saved") return deals.filter((d) => d.action === "saved");
  if (chip === "skipped") return deals.filter((d) => d.action === "dismissed");
  // Default grid hides skipped deals (same idea as Discover For you).
  return deals.filter((d) => d.action !== "dismissed");
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
  subscriptionTier = "free",
  isOwner = true,
  initialWatching = false,
  initialFollowing = false,
  watcherCount = 0,
  ownerDisplayName = null,
}: {
  project: ProjectRow;
  initialDeals: DealWithScore[];
  /** True when the server-side deals read errored (deploy/transient). */
  initialLoadFailed?: boolean;
  subscriptionTier?: SubscriptionTier;
  /** False when viewing someone else's public project (browse mode). */
  isOwner?: boolean;
  initialWatching?: boolean;
  initialFollowing?: boolean;
  watcherCount?: number;
  ownerDisplayName?: string | null;
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
  // Renaming is purely cosmetic: deals, scores, and share links all key on
  // UUIDs / share tokens, never the name, so a rename can't break anything
  // someone else has been sent.
  const [name, setName] = useState(project.name);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nightlyEnabled, setNightlyEnabled] = useState(
    project.nightly_scout_enabled ?? true,
  );
  const [isPublic, setIsPublic] = useState(project.is_public ?? false);
  const [lastScoutAt, setLastScoutAt] = useState<string | null>(
    project.last_scout_at,
  );
  const [statusChip, setStatusChip] = useState<DealStatusChip>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [shelf, setShelf] = useState<DealShelf>("live");
  const [shelfCounts, setShelfCounts] = useState({
    live: initialDeals.length,
    archived: 0,
    all: initialDeals.length,
  });
  const [constraintsDraft, setConstraintsDraft] = useState<ProjectConstraints>(
    project.constraints,
  );
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [savingConstraints, setSavingConstraints] = useState(false);
  const [constraintsNote, setConstraintsNote] = useState<string | null>(null);
  const [substituteOpen, setSubstituteOpen] = useState(false);
  const isPro = subscriptionTier === "pro";
  const projectIdRef = useRef(project.id);
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  const scoutFresh = isScoutWithinCooldown(lastScoutAt);
  const scoutedAgo = formatScoutedAgo(lastScoutAt);

  const statusCounts = useMemo(
    () => ({
      all: deals.filter((d) => d.action !== "dismissed").length,
      saved: deals.filter((d) => d.action === "saved").length,
      skipped: deals.filter((d) => d.action === "dismissed").length,
    }),
    [deals],
  );

  const statusPool = useMemo(
    () => dealsForStatusChip(deals, statusChip),
    [deals, statusChip],
  );

  const visibleDeals = useMemo(
    () => applyDealFilters(statusPool, filters),
    [statusPool, filters],
  );

  function setDealAction(
    dealId: string,
    action: DealWithScore["action"],
  ) {
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, action } : d)),
    );
  }

  async function onSave(deal: DealWithScore) {
    setBusyId(deal.id);
    setActionNote(null);
    setError(null);
    try {
      await postDealAction(deal.id, deal.project_id, "saved");
      setDealAction(deal.id, "saved");
      setActionNote("Saved — find it under Saved or in Portfolio.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onUnsave(deal: DealWithScore) {
    setBusyId(deal.id);
    setActionNote(null);
    setError(null);
    try {
      await deleteDealAction(deal.id, "saved");
      setDealAction(deal.id, null);
      setActionNote("Removed from Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onSkip(deal: DealWithScore) {
    setBusyId(deal.id);
    setActionNote(null);
    setError(null);
    try {
      await postDealAction(deal.id, deal.project_id, "dismissed");
      setDealAction(deal.id, "dismissed");
      setActionNote("Skipped — restore anytime from the Skipped chip.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onUnskip(deal: DealWithScore) {
    setBusyId(deal.id);
    setActionNote(null);
    setError(null);
    try {
      await deleteDealAction(deal.id, "dismissed");
      setDealAction(deal.id, null);
      setActionNote("Restored — it's back in All.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  // Mirror of `deals.length` readable inside stable callbacks without
  // recreating them (recreating refreshDeals used to churn the realtime
  // subscription on every deals change).
  const dealsCountRef = useRef(deals.length);
  dealsCountRef.current = deals.length;

  const refreshShelfCounts = useCallback(async () => {
    const supabase = createClient();
    const base = () =>
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id);
    const [liveRes, archivedRes, allRes] = await Promise.all([
      base().eq("inventory_status", "live"),
      base().eq("inventory_status", "archived"),
      base(),
    ]);
    setShelfCounts({
      live: liveRes.count ?? 0,
      archived: archivedRes.count ?? 0,
      all: allRes.count ?? 0,
    });
  }, [project.id]);

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
      const currentShelf = shelfRef.current;
      const d = await listDeals(supabase, project.id, { shelf: currentShelf });
      if (
        currentShelf === "live" &&
        d.length === 0 &&
        dealsCountRef.current > 0
      ) {
        throw new Error("empty read while grid populated (RLS/session race)");
      }
      setDeals(rankByScore(d));
      setLoadFailed(false);
      void refreshShelfCounts();
      return d.length;
    } catch (err) {
      // Keep whatever is currently rendered; flag the failure only when
      // there's nothing on screen, so the empty state offers a retry
      // instead of a misleading "no deals yet".
      console.warn("[project] deals refresh skipped:", err);
      setLoadFailed(dealsCountRef.current === 0);
      return null;
    }
  }, [project.id, refreshShelfCounts]);

  useEffect(() => {
    setConstraintsDraft(project.constraints);
  }, [project.constraints]);

  useEffect(() => {
    void refreshDeals();
  }, [shelf, refreshDeals]);

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
      if (cancelled || count === null || count > 0 || !lastScoutAt) {
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

  async function runScout(mode: ScoutMode = "append") {
    setError(null);
    setScouting(true);
    setScoutStatus(
      mode === "substitute"
        ? "Substituting inventory…"
        : "Scouting…",
    );
    try {
      const res = await fetch(`/api/projects/${project.id}/scout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
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
      const baseMessage =
        mode === "substitute"
          ? `Substituted · saw ${json.candidatesSeen} · ${json.dealsAdded} now live`
          : `Saw ${json.candidatesSeen} candidates · ${json.dealsAdded} match your goals`;
      setScoutStatus(
        unsupported.length
          ? `${baseMessage} · ${formatUnsupportedHint(unsupported)}`
          : baseMessage,
      );
      setLastScoutAt(new Date().toISOString());
      setShelf("live");
      shelfRef.current = "live";
      await refreshDeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScoutStatus(null);
    } finally {
      setScouting(false);
      setSubstituteOpen(false);
    }
  }

  async function saveConstraints() {
    setSavingConstraints(true);
    setConstraintsNote(null);
    setError(null);
    try {
      const validated = ProjectConstraintsSchema.parse(constraintsDraft);
      const supabase = createClient();
      await updateProject(supabase, project.id, { constraints: validated });
      setConstraintsDraft(validated);
      setConstraintsNote("Constraints saved. Scout to apply them to inventory.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConstraints(false);
    }
  }

  async function saveConstraintsAndScout(mode: ScoutMode) {
    setSavingConstraints(true);
    setError(null);
    try {
      const validated = ProjectConstraintsSchema.parse(constraintsDraft);
      const supabase = createClient();
      await updateProject(supabase, project.id, { constraints: validated });
      setConstraintsDraft(validated);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSavingConstraints(false);
      return;
    }
    setSavingConstraints(false);
    if (mode === "substitute") {
      setSubstituteOpen(true);
      return;
    }
    await runScout("append");
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

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setEditingName(false);
      setNameDraft(name);
      return;
    }
    setSavingName(true);
    try {
      const supabase = createClient();
      await updateProject(supabase, project.id, { name: trimmed });
      setName(trimmed);
      setEditingName(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
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
      {editingName && isOwner ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveName();
              if (e.key === "Escape") {
                setEditingName(false);
                setNameDraft(name);
              }
            }}
            autoFocus
            maxLength={120}
            aria-label="Project name"
            className="bg-surface border border-border rounded-xl px-3 py-2 text-xl font-bold w-full sm:max-w-md focus:outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <Button
              onClick={saveName}
              loading={savingName}
              className="!text-xs !px-4 !py-2"
            >
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingName(false);
                setNameDraft(name);
              }}
              className="!text-xs !px-4 !py-2"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1 min-w-0">
          <h1 className="text-3xl font-bold min-w-0 break-words">{name}</h1>
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setNameDraft(name);
                setEditingName(true);
              }}
              title="Rename project"
              aria-label="Rename project"
              className="text-textMuted hover:text-text shrink-0 p-2.5 mt-0.5 rounded-lg hover:bg-surface transition-colors"
            >
              ✎
            </button>
          ) : (
            <Badge className="mt-2 shrink-0">Public project</Badge>
          )}
        </div>
      )}
      <p className="text-textMuted text-sm mt-1">{marketLabel}</p>

      {isOwner && isPro ? (
        <Collapsible
          open={constraintsOpen}
          onOpenChange={setConstraintsOpen}
          className="bg-surface border border-border rounded-2xl mt-4 mb-4"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-textMuted text-xs mb-2">Search constraints</p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{constraintsDraft.strategy}</Badge>
                  {constraintsDraft.propertyTypes
                    .filter((t) => t !== "any")
                    .slice(0, 3)
                    .map((t) => (
                      <Badge key={t}>{PROPERTY_TYPE_LABELS[t]}</Badge>
                    ))}
                  {constraintsDraft.priceMax ? (
                    <Badge>≤ {formatMoney(constraintsDraft.priceMax)}</Badge>
                  ) : null}
                  {constraintsDraft.bedsMin ? (
                    <Badge>≥ {constraintsDraft.bedsMin} bd</Badge>
                  ) : null}
                  <Badge>DSCR ≥ {constraintsDraft.minDSCR.toFixed(2)}</Badge>
                </div>
                {lastScoutAt ? (
                  <p className="text-textMuted text-xs mt-3">
                    Last scout {formatDate(lastScoutAt)}
                    {scoutedAgo ? ` · ${scoutedAgo}` : ""}
                  </p>
                ) : null}
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-textMuted transition-transform",
                  constraintsOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border px-4 pb-4 pt-2">
              <ConstraintReview
                name={name}
                setName={setName}
                constraints={constraintsDraft}
                setConstraints={setConstraintsDraft}
                showName={false}
                showFooter={false}
                compact
                title="Edit search"
                subtitle="All fields from your parsed request. Save, then append or substitute deals."
                error={null}
              />
              {constraintsNote ? (
                <p className="text-textMuted text-xs mt-2">{constraintsNote}</p>
              ) : null}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => void saveConstraints()}
                  loading={savingConstraints}
                  disabled={scouting}
                >
                  Save constraints
                </Button>
                <Button
                  onClick={() => void saveConstraintsAndScout("append")}
                  loading={scouting}
                  disabled={savingConstraints}
                >
                  Scout: Append
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void saveConstraintsAndScout("substitute")}
                  loading={scouting}
                  disabled={savingConstraints}
                >
                  Scout: Substitute
                </Button>
              </div>
              <p className="text-textMuted text-[11px] mt-2 leading-5">
                Append adds new matches and keeps live deals. Substitute moves
                current live deals to Archived (still searchable), then scouts a
                fresh live set.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="bg-surface border border-border rounded-2xl p-4 mt-4 mb-4 space-y-3">
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
              <Badge>
                ≥ {Math.round((c.lotSizeMinSqft / 43_560) * 100) / 100} ac
              </Badge>
            ) : null}
            {c.yearBuiltMin ? <Badge>Built ≥ {c.yearBuiltMin}</Badge> : null}
            {c.daysOnMarketMax ? (
              <Badge>Listed ≤ {c.daysOnMarketMax}</Badge>
            ) : null}
            {c.downPayment ? (
              <Badge>Down {formatMoney(c.downPayment)}</Badge>
            ) : null}
            {c.targetMonthlyCashflow ? (
              <Badge>{formatMoney(c.targetMonthlyCashflow)}/mo</Badge>
            ) : null}
            <Badge>DSCR ≥ {c.minDSCR.toFixed(2)}</Badge>
            <Badge>{(c.mortgage.rateAPR * 100).toFixed(2)}% APR</Badge>
          </div>
          {lastScoutAt ? (
            <p className="text-textMuted text-xs mt-3">
              Last scout {formatDate(lastScoutAt)}
              {scoutedAgo ? ` · ${scoutedAgo}` : ""}
            </p>
          ) : null}
          {isOwner && !isPro ? (
            <ProLockedPanel
              title="Edit search & substitute"
              description="Pro unlocks the full constraints editor and Substitute re-scout (archive live deals, keep them searchable)."
              feature="Edit project constraints and substitute inventory"
            />
          ) : null}
        </div>
      )}

      <Dialog open={substituteOpen} onOpenChange={setSubstituteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substitute live deals?</DialogTitle>
            <DialogDescription>
              Current live deals move to Archived. They stay on this project for
              search and history. New scout matches become the live inventory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSubstituteOpen(false)}
              disabled={scouting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void runScout("substitute")}
              loading={scouting}
            >
              Substitute & scout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isOwner ? (
        <>
          <div className="mb-3 space-y-2">
            <NightlyScoutToggle
              projectId={project.id}
              enabled={nightlyEnabled}
              onEnabledChange={setNightlyEnabled}
              subscriptionTier={subscriptionTier}
            />
            <PublicFeedToggle
              projectId={project.id}
              enabled={isPublic}
              onEnabledChange={setIsPublic}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void runScout("append")}
              loading={scouting}
              disabled={scoutFresh && !scouting}
              className="flex-1 sm:flex-none"
              title={
                scoutFresh
                  ? "Scouted in the last 24 hours — use Scout anyway if you changed filters"
                  : undefined
              }
            >
              {scouting
                ? "Scouting…"
                : scoutFresh
                  ? "Scouted recently"
                  : isPro
                    ? "Scout: Append"
                    : "Scout deals"}
            </Button>
            <ImportListingPanel
              projects={[project]}
              initialProjectId={project.id}
              lockProject
              triggerLabel="Import listing"
              triggerVariant="secondary"
              triggerClassName="flex-1 sm:flex-none"
            />
            {scoutFresh && !scouting ? (
              <button
                type="button"
                className="text-xs text-textMuted hover:underline"
                onClick={() => void runScout("append")}
              >
                Scout anyway
              </button>
            ) : null}
          </div>
          {scoutFresh && !scouting ? (
            <p className="text-textMuted text-xs mt-2 leading-5">
              Scouted recently — the search already prefers listings from the
              last day. Nightly Pro catch-up runs overnight
              {nightlyEnabled && subscriptionTier === "pro"
                ? " for this project"
                : ""}
              , or use Scout anyway if you changed filters.
            </p>
          ) : null}
          {scoutStatus ? (
            <p className="text-textMuted text-xs mt-2">{scoutStatus}</p>
          ) : null}
          {error ? (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mt-3">
              <p className="text-danger text-xs">{error}</p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mb-4 space-y-3">
          {ownerDisplayName ? (
            <p className="text-textMuted text-xs">
              Scout by{" "}
              <a
                href={`/u/${project.owner_id}`}
                className="text-primary hover:underline"
              >
                {ownerDisplayName}
              </a>
            </p>
          ) : (
            <p className="text-textMuted text-xs">
              Scout by{" "}
              <a
                href={`/u/${project.owner_id}`}
                className="text-primary hover:underline"
              >
                investor
              </a>
            </p>
          )}
          {project.is_public ? (
            <div className="flex flex-wrap items-center gap-2">
              <FollowButton
                userId={project.owner_id}
                initialFollowing={initialFollowing}
              />
              <WatchProjectButton
                projectId={project.id}
                initialWatching={initialWatching}
                watcherCount={watcherCount}
              />
            </div>
          ) : null}
          <p className="text-textMuted text-xs">
            Browse mode — Follow the investor or Watch this scout to fill Friends.
          </p>
        </div>
      )}

      <h2 className="text-lg font-semibold mt-8 mb-3">
        Deals{" "}
        {deals.length
          ? visibleDeals.length !== statusPool.length ||
            statusPool.length !== deals.length
            ? `(${visibleDeals.length} of ${deals.length})`
            : `(${deals.length})`
          : ""}
      </h2>
      {isOwner ? (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-1 px-1 scrollbar-none">
          {SHELF_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setShelf(chip.id);
                setActionNote(null);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                shelf === chip.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface text-textMuted hover:text-text",
              )}
            >
              {chip.label}
              <span className="ml-1.5 tabular-nums opacity-70">
                {shelfCounts[chip.id]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {deals.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-1 px-1 scrollbar-none">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setStatusChip(chip.id);
                setActionNote(null);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                statusChip === chip.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface text-textMuted hover:text-text",
              )}
            >
              {chip.label}
              <span className="ml-1.5 tabular-nums opacity-70">
                {statusCounts[chip.id]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {actionNote ? (
        <p className="text-textMuted text-xs mb-3">{actionNote}</p>
      ) : null}
      {!isOwner && error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}
      {deals.length > 0 ? (
        <DealFiltersBar
          deals={statusPool}
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            setFilterSavedNote(null);
          }}
          shownCount={visibleDeals.length}
          onSaveToProject={
            isOwner ? () => void saveFiltersToProject() : undefined
          }
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
          {loadFailed || lastScoutAt ? (
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
              No deals yet. Click &quot;Scout deals&quot; to find matches, or
              &quot;Import listing&quot; to paste a URL or address.
            </p>
          )}
        </div>
      ) : statusPool.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-textMuted text-sm">
            {statusChip === "saved"
              ? "No saved deals yet — tap the heart on a listing."
              : statusChip === "skipped"
                ? "No skipped deals yet."
                : "No deals in this view."}
          </p>
        </div>
      ) : visibleDeals.length === 0 && isAnyFilterActive(filters) ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-textMuted text-sm">
            No deals match the current filters ({statusPool.length} hidden).
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
          {visibleDeals.map((deal) => {
            const isSkipped = statusChip === "skipped";
            const isSaved = deal.action === "saved";
            return (
              <DealCard
                key={deal.id}
                deal={deal}
                strategy={project.constraints.strategy}
                busy={busyId === deal.id}
                saved={isSaved}
                onSave={
                  isSkipped
                    ? undefined
                    : () => void (isSaved ? onUnsave(deal) : onSave(deal))
                }
                onSkip={() =>
                  void (isSkipped ? onUnskip(deal) : onSkip(deal))
                }
                skipLabel={isSkipped ? "Restore" : undefined}
              />
            );
          })}
        </div>
      )}

      {isOwner ? (
        <div className="mt-12">
          <button
            type="button"
            onClick={onDelete}
            className="text-danger text-sm font-semibold hover:underline"
          >
            Delete project
          </button>
        </div>
      ) : null}
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
