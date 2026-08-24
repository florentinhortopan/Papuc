import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint (or return) a public share link for a project.
 * Same ownership + admin-update pattern as deal share tokens.
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

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, share_token, owner_id")
    .eq("id", projectId)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  if (project.owner_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let token = project.share_token as string | null;
  if (!token) {
    token = randomBytes(9).toString("base64url");
    const { error: updateErr } = await createAdminClient()
      .from("projects")
      .update({ share_token: token })
      .eq("id", projectId)
      .is("share_token", null);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    const { data: fresh } = await supabase
      .from("projects")
      .select("share_token")
      .eq("id", projectId)
      .single();
    token = (fresh?.share_token as string | null) ?? token;
  }

  const origin = getSiteUrl(req.url);
  return NextResponse.json({
    url: `${origin}/share/p/${token}`,
    token,
  });
}
