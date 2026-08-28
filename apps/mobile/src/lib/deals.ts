import { apiFetch } from "./api";
import { supabase } from "./supabase";
import type {
  DealActionKind,
  DealActionsRow,
  DealScoresRow,
  DealsRow,
} from "./database.types";

export type DealWithScore = DealsRow & {
  score: DealScoresRow | null;
  action: DealActionKind | null;
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
  return arr[0]?.action ?? null;
}

export async function listDeals(
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

export async function getDeal(id: string): Promise<DealWithScore> {
  const { data, error } = await supabase
    .from("deals")
    .select("*, deal_scores(*), deal_actions(action)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const r = data as unknown as DealRowWithJoins;
  return { ...(r as DealsRow), score: pickScore(r), action: pickAction(r) };
}

export async function actOnDeal(input: {
  dealId: string;
  projectId: string;
  action: DealActionKind;
  note?: string;
}): Promise<void> {
  // Prefer the web action route so save clears dismiss (and vice versa),
  // matching Home feed / portfolio behavior.
  await apiFetch<{ ok: boolean }>(`/api/deals/${input.dealId}/action`, {
    method: "POST",
    body: JSON.stringify({
      action: input.action,
      projectId: input.projectId,
    }),
  });
}

export async function clearDealAction(input: {
  dealId: string;
  action: DealActionKind;
}): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    `/api/deals/${input.dealId}/action?action=${encodeURIComponent(input.action)}`,
    { method: "DELETE" },
  );
}

export async function scoutProject(
  projectId: string,
  opts?: { mode?: "append" | "substitute" },
): Promise<{
  candidatesSeen: number;
  dealsAdded: number;
  dealsScored: number;
}> {
  return apiFetch(`/api/projects/${projectId}/scout`, {
    method: "POST",
    body: JSON.stringify({ mode: opts?.mode ?? "append" }),
  });
}

