import { NextResponse } from "next/server";

import { scoutLikeThis } from "@/lib/scout-like-this";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: {
    alsoFollowOwner?: boolean;
    alsoWatchProject?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const result = await scoutLikeThis(supabase, {
      dealId,
      alsoFollowOwner: body.alsoFollowOwner !== false,
      alsoWatchProject: body.alsoWatchProject !== false,
    });
    return NextResponse.json({
      ok: true,
      projectId: result.project.id,
      followedOwner: result.followedOwner,
      watchedSource: result.watchedSource,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not available") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
