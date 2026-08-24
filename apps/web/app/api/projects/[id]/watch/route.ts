import { NextResponse } from "next/server";

import { getProject } from "@/lib/projects";
import { unwatchProject, watchProject } from "@/lib/social";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const project = await getProject(supabase, projectId);
    if (!project.is_public) {
      return NextResponse.json(
        { error: "only public projects can be watched" },
        { status: 400 },
      );
    }
    if (project.owner_id === user.id) {
      return NextResponse.json(
        { error: "cannot watch your own project" },
        { status: 400 },
      );
    }
    await watchProject(supabase, projectId);
    return NextResponse.json({ ok: true, watching: true });
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
  const { id: projectId } = await ctx.params;
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await unwatchProject(supabase, projectId);
    return NextResponse.json({ ok: true, watching: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
