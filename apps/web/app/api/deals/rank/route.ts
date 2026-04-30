import { NextResponse } from "next/server";
import { ClaudeProvider, type DealScoreInput } from "@papuc/core";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 10;

/**
 * Authenticated either by the cron secret (server-to-server) or by an
 * authenticated user session forwarded through the supabase ssr client.
 * We just verify the secret here since this is invoked internally from
 * the scout route as a fire-and-forget; user-facing flows should not call
 * /api/deals/rank directly.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);
  const secret = process.env.CRON_SECRET;
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }

  const sb = createAdminClient();

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("id, raw_prompt, constraints, owner_id")
    .eq("id", body.projectId)
    .single();
  if (pErr || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const { data: scores, error: sErr } = await sb
    .from("deal_scores")
    .select(
      "deal_id, dscr, cash_on_cash, monthly_cashflow, irr_5yr, computed_proforma, deals!inner(address, price, beds, baths, sqft, est_rent)",
    )
    .eq("project_id", body.projectId)
    .is("rationale", null)
    .order("score", { ascending: false })
    .limit(BATCH_SIZE);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!scores || scores.length === 0) {
    return NextResponse.json({ ranked: 0 });
  }

  const deals: DealScoreInput[] = (scores as Array<Record<string, any>>).map(
    (row) => {
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
    },
  );

  try {
    const claude = new ClaudeProvider({
      apiKey,
      model: process.env.ANTHROPIC_MODEL,
    });
    const rankings = await claude.rankDeals({
      userPrompt: (project.raw_prompt as string) ?? "",
      constraints: project.constraints as any,
      deals,
    });

    let ranked = 0;
    for (const r of rankings) {
      const { error } = await sb
        .from("deal_scores")
        .update({ score: Math.round(r.score), rationale: r.rationale })
        .eq("deal_id", r.dealId)
        .eq("project_id", body.projectId);
      if (!error) ranked += 1;
    }
    return NextResponse.json({ ranked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
