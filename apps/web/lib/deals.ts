import type { ProjectConstraints } from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DealActionKind,
  DealActionsRow,
  DealScoresRow,
  DealsRow,
  ScenariosRow,
} from "./database.types";
import { asScenarioInputs } from "./scenarios";
import { underwriteSeeds } from "./underwrite";

export type DealWithScore = DealsRow & {
  score: DealScoresRow | null;
  action: DealActionKind | null;
};

/** Latest saved scenario snapshot for portfolio / compare surfaces. */
export type DealScenarioSummary = {
  id: string;
  name: string;
  monthlyCashflow: number | null;
  downPayment: number | null;
};

export type DealWithPortfolioMetrics = DealWithScore & {
  /** Prefer saved scenario cashflow/down; otherwise score + project defaults. */
  monthlyCashflow: number | null;
  downPayment: number | null;
  scenario: DealScenarioSummary | null;
  /** True when cashflow/down came from a saved scenario rather than defaults. */
  fromScenario: boolean;
};

interface DealRowWithJoins extends DealsRow {
  deal_scores: DealScoresRow[] | DealScoresRow | null;
  deal_actions: Pick<DealActionsRow, "action">[] | null;
}

function pickScore(row: DealRowWithJoins): DealScoresRow | null {
  const s = row.deal_scores;
  if (!s) return null;
  if (Array.isArray(s)) return s[0] ?? null;
  return s;
}

function pickAction(row: DealRowWithJoins): DealActionKind | null {
  const arr = row.deal_actions;
  if (!arr || arr.length === 0) return null;
  const kinds = arr.map((a) => a.action);
  // Prefer like/skip over contact/offer so the project grid status is accurate.
  if (kinds.includes("saved")) return "saved";
  if (kinds.includes("dismissed")) return "dismissed";
  return kinds[0] ?? null;
}

export async function listDeals(
  supabase: SupabaseClient,
  projectId: string,
  opts?: { shelf?: "live" | "archived" | "all" },
): Promise<DealWithScore[]> {
  const shelf = opts?.shelf ?? "live";
  let query = supabase
    .from("deals")
    .select("*, deal_scores(*), deal_actions(action)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(shelf === "all" ? 300 : 100);
  if (shelf === "live" || shelf === "archived") {
    query = query.eq("inventory_status", shelf);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as DealRowWithJoins[];
  return rows.map((r) => ({
    ...(r as DealsRow),
    score: pickScore(r),
    action: pickAction(r),
  }));
}

export async function getDeal(
  supabase: SupabaseClient,
  id: string,
): Promise<DealWithScore> {
  const { data, error } = await supabase
    .from("deals")
    .select("*, deal_scores(*), deal_actions(action)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const r = data as unknown as DealRowWithJoins;
  return { ...(r as DealsRow), score: pickScore(r), action: pickAction(r) };
}

export async function actOnDeal(
  supabase: SupabaseClient,
  input: {
    dealId: string;
    projectId: string;
    action: DealActionKind;
    note?: string;
  },
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await supabase.from("deal_actions").upsert(
    {
      deal_id: input.dealId,
      project_id: input.projectId,
      user_id: userId,
      action: input.action,
      note: input.note ?? null,
    },
    { onConflict: "deal_id,user_id,action" },
  );
  if (error) throw error;
}

export async function clearDealAction(
  supabase: SupabaseClient,
  input: {
    dealId: string;
    action: DealActionKind;
  },
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await supabase
    .from("deal_actions")
    .delete()
    .eq("deal_id", input.dealId)
    .eq("user_id", userId)
    .eq("action", input.action);
  if (error) throw error;
}

export async function listSavedDeals(
  supabase: SupabaseClient,
): Promise<DealWithPortfolioMetrics[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("deal_actions")
    .select("deal_id, action, deals!inner(*, deal_scores(*))")
    .eq("user_id", userId)
    .eq("action", "saved")
    .order("created_at", { ascending: false });
  if (error) throw error;

  type Joined = Pick<DealActionsRow, "action"> & {
    deal_id: string;
    deals: DealsRow & { deal_scores: DealScoresRow[] | DealScoresRow | null };
  };

  const rows = (data ?? []) as unknown as Joined[];
  const base = rows.map((r) => {
    const deal = r.deals;
    const scores = deal.deal_scores;
    const score: DealScoresRow | null = Array.isArray(scores)
      ? (scores[0] ?? null)
      : (scores ?? null);
    const { deal_scores: _drop, ...rest } = deal;
    return {
      ...(rest as DealsRow),
      score,
      action: r.action,
    } satisfies DealWithScore;
  });

  if (base.length === 0) return [];

  const dealIds = base.map((d) => d.id);
  const projectIds = [...new Set(base.map((d) => d.project_id))];

  const [{ data: scenarioRows }, { data: projectRows }] = await Promise.all([
    supabase
      .from("scenarios")
      .select("id, deal_id, name, inputs, monthly_cashflow_at_save, created_at")
      .eq("owner_id", userId)
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, constraints").in("id", projectIds),
  ]);

  const latestScenarioByDeal = new Map<string, ScenariosRow>();
  for (const row of (scenarioRows ?? []) as ScenariosRow[]) {
    if (!latestScenarioByDeal.has(row.deal_id)) {
      latestScenarioByDeal.set(row.deal_id, row);
    }
  }

  const constraintsByProject = new Map<string, ProjectConstraints | null>();
  for (const p of (projectRows ?? []) as Array<{
    id: string;
    constraints: unknown;
  }>) {
    constraintsByProject.set(
      p.id,
      (p.constraints ?? null) as ProjectConstraints | null,
    );
  }

  return base.map((deal) => {
    const scenarioRow = latestScenarioByDeal.get(deal.id) ?? null;
    const inputs = scenarioRow ? asScenarioInputs(scenarioRow.inputs) : null;
    const scenarioDown =
      inputs?.downPayment != null && inputs.downPayment.trim() !== ""
        ? Number(inputs.downPayment)
        : null;
    const scenarioCash =
      scenarioRow?.monthly_cashflow_at_save != null &&
      Number.isFinite(Number(scenarioRow.monthly_cashflow_at_save))
        ? Number(scenarioRow.monthly_cashflow_at_save)
        : null;

    const constraints = constraintsByProject.get(deal.project_id);
    const defaultDown =
      constraints != null
        ? underwriteSeeds(deal, constraints).downPayment
        : null;

    const scenario: DealScenarioSummary | null = scenarioRow
      ? {
          id: scenarioRow.id,
          name: scenarioRow.name,
          monthlyCashflow: scenarioCash,
          downPayment:
            scenarioDown != null && Number.isFinite(scenarioDown)
              ? scenarioDown
              : null,
        }
      : null;

    return {
      ...deal,
      scenario,
      fromScenario: scenario != null,
      monthlyCashflow: scenarioCash ?? deal.score?.monthly_cashflow ?? null,
      downPayment:
        scenario?.downPayment != null
          ? scenario.downPayment
          : defaultDown != null && Number.isFinite(defaultDown)
            ? defaultDown
            : null,
    };
  });
}
