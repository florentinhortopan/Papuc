import { NextResponse } from "next/server";

import { assertAdmin } from "@/lib/admin";
import { setSubscriptionTier } from "@/lib/admin-users";
import type { SubscriptionTier } from "@/lib/database.types";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const gate = assertAdmin(user);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { userIds?: string[]; tier?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const tier = body.tier as SubscriptionTier | undefined;
  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id): id is string => typeof id === "string")
    : [];
  if (tier !== "pro" && tier !== "free") {
    return NextResponse.json({ error: "tier must be pro or free" }, { status: 400 });
  }
  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds required" }, { status: 400 });
  }
  if (userIds.length > 100) {
    return NextResponse.json(
      { error: "at most 100 users per request" },
      { status: 400 },
    );
  }

  try {
    const result = await setSubscriptionTier(userIds, tier);
    return NextResponse.json({ ok: true, ...result, tier });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
