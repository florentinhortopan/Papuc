import { NextResponse } from "next/server";
import { ClaudeProvider } from "@papuc/core/llm";

import {
  matchLenders,
  type FinancingFitProfile,
} from "@/lib/financing-fit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseProfile(raw: unknown): FinancingFitProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const strategy = o.strategy === "STR" ? "STR" : o.strategy === "LTR" ? "LTR" : null;
  const price = Number(o.price);
  const downPayment = Number(o.downPayment);
  const ltv = Number(o.ltv);
  const dscr = Number(o.dscr);
  const dscrLenderHaircut = Number(o.dscrLenderHaircut);
  const monthlyCashflow = Number(o.monthlyCashflow);
  const rehabBudget = Number(o.rehabBudget ?? 0);
  if (
    !strategy ||
    !Number.isFinite(price) ||
    !Number.isFinite(downPayment) ||
    !Number.isFinite(ltv) ||
    !Number.isFinite(dscr) ||
    !Number.isFinite(dscrLenderHaircut) ||
    !Number.isFinite(monthlyCashflow)
  ) {
    return null;
  }
  return {
    strategy,
    price,
    downPayment,
    ltv,
    dscr,
    dscrLenderHaircut,
    monthlyCashflow,
    rehabBudget: Number.isFinite(rehabBudget) ? Math.max(0, rehabBudget) : 0,
    isLand: Boolean(o.isLand),
    state: typeof o.state === "string" ? o.state : null,
    city: typeof o.city === "string" ? o.city : null,
    zip: typeof o.zip === "string" ? o.zip : null,
    propertyType: typeof o.propertyType === "string" ? o.propertyType : null,
    interestOnly: typeof o.interestOnly === "boolean" ? o.interestOnly : undefined,
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS: own or public project deals are readable.
  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, project_id, state, city, zip")
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  let body: { profile?: unknown } = {};
  try {
    body = (await req.json()) as { profile?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const profile = parseProfile(body.profile);
  if (!profile) {
    return NextResponse.json(
      { error: "profile with strategy, price, downPayment, ltv, dscr fields is required" },
      { status: 400 },
    );
  }

  // Prefer live deal location if the client omitted it.
  if (!profile.state && deal.state) profile.state = deal.state as string;
  if (!profile.city && deal.city) profile.city = deal.city as string;
  if (!profile.zip && deal.zip) profile.zip = deal.zip as string;

  const matched = matchLenders(profile);

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ...matched,
      advice: {
        headline: matched.matches[0]
          ? `Start with ${matched.matches[0].lender.name}`
          : "No strong lender matches yet",
        pathSummary: matched.matches.length
          ? "Matched lenders from Papuc’s curated directory using your live scenario. Add ANTHROPIC_API_KEY for narrative next-step advice."
          : "No lenders cleared the filters for this scenario. Try more down payment, a lower rehab budget, or a cash/bridge path.",
        lenderNotes: matched.matches.map((m) => ({
          lenderId: m.lender.id,
          note: m.fitReasons[0] ?? m.lender.notes,
        })),
        nextSteps: [
          "Confirm DSCR / LTV program guidelines on the lender’s site.",
          "Gather entity docs (LLC), ID, and a simple rent schedule if DSCR.",
          "If rehab is material, ask about bridge → DSCR refinance timelines.",
          "Never treat directory matches as a rate lock or approval.",
        ],
        disclaimer:
          "Educational matching only — not a loan offer or personalized investment advice.",
      },
      model: null,
    });
  }

  try {
    const claude = new ClaudeProvider({
      apiKey,
      model: process.env.ANTHROPIC_MODEL,
    });
    const advice = await claude.adviseFinancingFit({
      profile: profile as unknown as Record<string, unknown>,
      matches: matched.matches.map((m) => ({
        id: m.lender.id,
        name: m.lender.name,
        url: m.lender.url,
        score: m.score,
        minDscr: m.lender.minDscr,
        maxLtv: m.lender.maxLtv,
        programs: m.suggestedPrograms,
        fitReasons: m.fitReasons,
        cautionReasons: m.cautionReasons,
        notes: m.lender.notes,
      })),
      flags: {
        needsHardMoneyOrCashPath: matched.needsHardMoneyOrCashPath,
        needsLowDownPath: matched.needsLowDownPath,
        needsSubOneDscr: matched.needsSubOneDscr,
        needsRehabPath: matched.needsRehabPath,
      },
    });

    return NextResponse.json({
      ...matched,
      advice,
      model: claude.modelId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
