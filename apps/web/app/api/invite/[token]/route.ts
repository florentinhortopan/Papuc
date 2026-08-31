import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accept a co-scout invite. Joins as role=member.
 * Free + Pro invitees can accept; minting is Pro-gated on the owner side.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("id, owner_id, name, collab_invite_token")
    .eq("collab_invite_token", token)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "invite not found" }, { status: 404 });
  }
  if (project.owner_id === user.id) {
    return NextResponse.json({
      projectId: project.id,
      alreadyOwner: true,
    });
  }

  const { error: upsertErr } = await admin.from("project_members").upsert(
    {
      project_id: project.id,
      user_id: user.id,
      role: "member",
    },
    { onConflict: "project_id,user_id" },
  );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Soft social: follow the owner so Friends fills with public deals too.
  try {
    const { followUser } = await import("@/lib/social");
    await followUser(supabase, project.owner_id as string);
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    projectId: project.id,
    name: project.name,
  });
}

/** Preview invite (signed-in or anon) for landing page. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("id, name, owner_id")
    .eq("collab_invite_token", token)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "invite not found" }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("public_profiles")
    .select("id, display_name")
    .eq("id", project.owner_id)
    .maybeSingle();

  return NextResponse.json({
    projectId: project.id,
    name: project.name,
    ownerId: project.owner_id,
    ownerDisplayName:
      (profile?.display_name as string | null)?.trim() ||
      `Investor ${String(project.owner_id).slice(0, 8)}`,
  });
}
