import { NextResponse } from "next/server";

import { followUser, unfollowUser } from "@/lib/social";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: followingId } = await ctx.params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!followingId) {
    return NextResponse.json({ error: "user id required" }, { status: 400 });
  }

  try {
    await followUser(supabase, followingId);
    return NextResponse.json({ ok: true, following: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("yourself") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: followingId } = await ctx.params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await unfollowUser(supabase, followingId);
    return NextResponse.json({ ok: true, following: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
