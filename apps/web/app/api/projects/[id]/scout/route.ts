import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { scoutProjectInternal } from "@/lib/scouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Scout calls can take 30-60s when many candidates need PropertyDetail hydration.
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
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

  try {
    const admin = createAdminClient();
    const result = await scoutProjectInternal(admin, id, {
      triggerKind: "manual",
      triggeredBy: user.id,
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
