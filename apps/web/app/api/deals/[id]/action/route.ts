import { NextResponse } from "next/server";

import { actOnDeal, clearDealAction } from "@/lib/deals";
import type { DealActionKind } from "@/lib/database.types";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: DealActionKind[] = ["saved", "dismissed", "contacted", "offer_made"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await ctx.params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: string; projectId?: string };
  try {
    body = (await req.json()) as { action?: string; projectId?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const action = body.action as DealActionKind | undefined;
  const projectId = body.projectId?.trim();
  if (!action || !ALLOWED.includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  try {
    // Liking clears a prior skip so the deal can reappear in For you / Saved.
    if (action === "saved") {
      await clearDealAction(supabase, { dealId, action: "dismissed" });
    }
    if (action === "dismissed") {
      await clearDealAction(supabase, { dealId, action: "saved" });
    }
    await actOnDeal(supabase, { dealId, projectId, action });
    return NextResponse.json({ ok: true, action });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await ctx.params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") as DealActionKind | null;
  if (!action || !ALLOWED.includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  try {
    await clearDealAction(supabase, { dealId, action });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
