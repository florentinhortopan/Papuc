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

export async function listDeals(projectId: string): Promise<DealWithScore[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(
      "*, deal_scores(*), deal_actions(action)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);
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
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await (supabase.from("deal_actions") as any)
    .upsert(
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

export async function clearDealAction(input: {
  dealId: string;
  action: DealActionKind;
}): Promise<void> {
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

export async function scoutProject(projectId: string): Promise<{
  candidatesSeen: number;
  dealsAdded: number;
  dealsScored: number;
}> {
  const { data, error } = await supabase.functions.invoke<{
    candidatesSeen: number;
    dealsAdded: number;
    dealsScored: number;
  }>("scout-project", { body: { projectId } });
  if (error) throw error;
  if (!data) throw new Error("no data returned");
  return data;
}
