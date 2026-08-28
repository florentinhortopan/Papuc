import { NextResponse } from "next/server";

import { listPersonalizedFeed } from "@/lib/feed";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const feed = await listPersonalizedFeed(supabase, user.id);
    return NextResponse.json(feed);
  } catch (err) {
    // Spine failure only — social soft-fails inside listPersonalizedFeed.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
