import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner removes a member, or member leaves. */
export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id: projectId, userId: targetUserId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const isOwner = project.owner_id === user.id;
  const isSelf = targetUserId === user.id;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (targetUserId === project.owner_id) {
    return NextResponse.json(
      { error: "cannot remove project owner" },
      { status: 400 },
    );
  }

  const { error: delErr } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", targetUserId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
