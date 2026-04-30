"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DealCard } from "@/components/deal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDeals, type DealWithScore } from "@/lib/deals";
import { deleteProject, type ProjectRow } from "@/lib/projects";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

function rankByScore(deals: DealWithScore[]): DealWithScore[] {
  return [...deals].sort(
    (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
  );
}

export function ProjectDetailClient({
  project,
  initialDeals,
}: {
  project: ProjectRow;
  initialDeals: DealWithScore[];
}) {
  const router = useRouter();
  const [deals, setDeals] = useState<DealWithScore[]>(rankByScore(initialDeals));
  const [scouting, setScouting] = useState(false);
  const [scoutStatus, setScoutStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectIdRef = useRef(project.id);

  const refreshDeals = useCallback(async () => {
    const supabase = createClient();
    try {
      const d = await listDeals(supabase, project.id);
      setDeals(rankByScore(d));
    } catch {
      // ignore
    }
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
      };
      setScoutStatus(
        `Saw ${json.candidatesSeen} candidates · ${json.dealsAdded} match your goals`,
      );
      await refreshDeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScoutStatus(null);
    } finally {
      setScouting(false);
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
          {c.priceMax ? <Badge>≤ {formatMoney(c.priceMax)}</Badge> : null}
          {c.bedsMin ? <Badge>≥ {c.bedsMin} bd</Badge> : null}
          {c.bathsMin ? <Badge>≥ {c.bathsMin} ba</Badge> : null}
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
        Deals {deals.length ? `(${deals.length})` : ""}
      </h2>
      {deals.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-textMuted text-sm">
            No deals yet. Click "Scout deals" to find listings that match your
            goals.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
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
