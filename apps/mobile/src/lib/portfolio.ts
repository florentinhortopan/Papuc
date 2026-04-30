import { supabase } from "./supabase";
import type { DealWithScore } from "./deals";
import type { DealActionsRow, DealScoresRow, DealsRow } from "./database.types";

export async function listSavedDeals(): Promise<DealWithScore[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("deal_actions")
    .select(
      "deal_id, action, deals!inner(*, deal_scores(*))",
    )
    .eq("user_id", userId)
    .eq("action", "saved")
    .order("created_at", { ascending: false });
  if (error) throw error;

  type Joined = Pick<DealActionsRow, "action"> & {
    deal_id: string;
    deals: DealsRow & { deal_scores: DealScoresRow[] | DealScoresRow | null };
  };

  const rows = (data ?? []) as unknown as Joined[];
  return rows.map((r) => {
    const deal = r.deals;
    const scores = deal.deal_scores;
    const score: DealScoresRow | null = Array.isArray(scores)
      ? (scores[0] ?? null)
      : (scores ?? null);
    const { deal_scores: _, ...rest } = deal;
    return {
      ...(rest as DealsRow),
      score,
      action: r.action,
    };
  });
}
