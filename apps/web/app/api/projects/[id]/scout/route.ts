import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route-client";
import { scoutProjectInternal } from "@/lib/scouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Scout calls can take 30-60s when many candidates need PropertyDetail hydration.
export const maxDuration = 300;

type ScoutBody = {
  mode?: "append" | "substitute";
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify the user owns the project before we use the admin client to bypass RLS.
  const { data: ownedProject, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (error || !ownedProject) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();
  const subscriptionTier =
    profile?.subscription_tier === "pro" ? "pro" : "free";

  let body: ScoutBody = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as ScoutBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const mode = body.mode === "substitute" ? "substitute" : "append";
  if (mode === "substitute" && subscriptionTier !== "pro") {
    return NextResponse.json(
      { error: "Substitute scout requires Pro" },
      { status: 403 },
    );
  }

  try {
    const admin = createAdminClient();
    const result = await scoutProjectInternal(admin, id, {
      triggerKind: "manual",
      triggeredBy: user.id,
      subscriptionTier,
      mode,
    });

    // Fire-and-forget rank pass so rationales populate after the response returns.
    void rankInBackground(id);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function rankInBackground(projectId: string) {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(`${url}/api/deals/rank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ projectId }),
    });
  } catch {
    // best-effort
  }
}
