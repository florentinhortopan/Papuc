import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint or rotate a co-scout invite link (Pro owners only).
 * Body: { rotate?: boolean }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.subscription_tier !== "pro") {
    return NextResponse.json(
      { error: "pro_required", feature: "friendCollab" },
      { status: 403 },
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, owner_id, collab_invite_token")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  if (project.owner_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let rotate = false;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { rotate?: boolean };
      rotate = Boolean(body.rotate);
    }
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  let token = project.collab_invite_token as string | null;
  if (!token || rotate) {
    token = randomBytes(12).toString("base64url");
    const { error: updateErr } = await createAdminClient()
      .from("projects")
      .update({ collab_invite_token: token })
      .eq("id", projectId)
      .eq("owner_id", user.id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  const origin = getSiteUrl(req.url);
  return NextResponse.json({
    url: `${origin}/invite/${token}`,
    token,
  });
}

/** List collaborators for a project the caller owns or belongs to. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, owner_id, collab_invite_token")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const { listProjectMembers, getProjectAccess } = await import(
    "@/lib/project-members"
  );
  const access = await getProjectAccess(supabase, project, user.id);
  if (!access.canManage && !access.isMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const members = await listProjectMembers(supabase, projectId);
  return NextResponse.json({
    members,
    hasInvite: Boolean(project.collab_invite_token),
  });
}
