// Edge Function: rank-deals
// Input: { projectId: string }
// Output: { ranked: number }
//
// Reads recently-scored deals for a project that don't have a Claude rationale
// and asks Claude to score 0..100 + write a 1-2 sentence "why this fits" blurb.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authedUser, getServiceClient } from "../_shared/supabase.ts";
import { anthropicMessages, findToolUse } from "../_shared/anthropic.ts";
import { RANK_DEALS_SYSTEM, RANK_DEALS_TOOL } from "../_shared/prompts.ts";

interface RankRequest {
  projectId: string;
}

interface DealForRanking {
  dealId: string;
  address: string;
  price: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  monthlyRent: number;
  pitiaTotal: number;
  dscr: number;
  cashOnCash: number;
  monthlyCashflow: number;
  irr5Yr: number | null;
}

interface ToolOutput {
  rankings: Array<{ dealId: string; score: number; rationale: string }>;
}

const BATCH_SIZE = 10;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const user = await authedUser(req);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: RankRequest;
  try {
    body = (await req.json()) as RankRequest;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  if (!body.projectId) return jsonResponse({ error: "projectId required" }, 400);

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY not set" }, 500);
  }

  const sb = getServiceClient();

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("id, raw_prompt, constraints, owner_id")
    .eq("id", body.projectId)
    .eq("owner_id", user.userId)
    .single();
  if (pErr || !project) return jsonResponse({ error: "project not found" }, 404);

  const { data: scores, error: sErr } = await sb
    .from("deal_scores")
    .select(
      "deal_id, dscr, cash_on_cash, monthly_cashflow, irr_5yr, computed_proforma, deals!inner(address, price, beds, baths, sqft, est_rent)",
    )
    .eq("project_id", body.projectId)
    .is("rationale", null)
    .order("score", { ascending: false })
    .limit(BATCH_SIZE);
  if (sErr) return jsonResponse({ error: sErr.message }, 500);
  if (!scores || scores.length === 0) return jsonResponse({ ranked: 0 });

  const deals: DealForRanking[] = (scores as Array<Record<string, any>>).map((row) => {
    const proforma = row.computed_proforma ?? {};
    const pitia = proforma?.pitiaMonthly?.total ?? 0;
    const deal = (row.deals ?? {}) as Record<string, any>;
    return {
      dealId: row.deal_id as string,
      address: (deal.address as string) ?? "",
      price: Number(deal.price ?? 0),
      beds: deal.beds as number | undefined,
      baths: deal.baths as number | undefined,
      sqft: deal.sqft as number | undefined,
      monthlyRent: Number(deal.est_rent ?? 0),
      pitiaTotal: Number(pitia),
      dscr: Number(row.dscr ?? 0),
      cashOnCash: Number(row.cash_on_cash ?? 0),
      monthlyCashflow: Number(row.monthly_cashflow ?? 0),
      irr5Yr: row.irr_5yr !== null ? Number(row.irr_5yr) : null,
    };
  });

  const userMessage = [
    `Original user prompt: ${project.raw_prompt}`,
    ``,
    `Constraints: ${JSON.stringify(project.constraints)}`,
    ``,
    `Scouted deals (numbers already computed):`,
    JSON.stringify(deals, null, 2),
  ].join("\n");

  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-20241022";
  let parsed: ToolOutput;
  try {
    const res = await anthropicMessages({
      model,
      max_tokens: 2048,
      system: RANK_DEALS_SYSTEM,
      tools: [RANK_DEALS_TOOL],
      tool_choice: { type: "tool", name: RANK_DEALS_TOOL.name },
      messages: [{ role: "user", content: userMessage }],
    });
    const tool = findToolUse<ToolOutput>(res.content, RANK_DEALS_TOOL.name);
    if (!tool) return jsonResponse({ error: "no tool call returned" }, 502);
    parsed = tool;
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }

  let ranked = 0;
  for (const r of parsed.rankings ?? []) {
    const { error } = await sb
      .from("deal_scores")
      .update({ score: Math.round(r.score), rationale: r.rationale })
      .eq("deal_id", r.dealId)
      .eq("project_id", body.projectId);
    if (!error) ranked += 1;
  }

  return jsonResponse({ ranked });
});
