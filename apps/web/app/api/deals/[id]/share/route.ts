import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint (or return the existing) public share link for a deal.
 *
 * Authorization: the RLS-scoped read below only succeeds for the deal's
 * owner, so only owners can mint links. The token itself is the public
 * page's authorization — 72 bits of entropy, no expiry (links in group
 * chats should not rot), revocable later by nulling the column.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, share_token")
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  let token = deal.share_token as string | null;
  if (!token) {
    token = randomBytes(9).toString("base64url");
    // Deals are written by the service role during scouting; user-scoped
    // clients have no UPDATE policy, so the mint goes through admin after
    // the ownership check above.
    const { error: updateErr } = await createAdminClient()
      .from("deals")
      .update({ share_token: token })
      .eq("id", dealId)
      .is("share_token", null);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    // Concurrent first-share: someone else may have won the null-guarded
    // update; re-read so both callers hand out the same token.
    const { data: fresh } = await supabase
      .from("deals")
      .select("share_token")
      .eq("id", dealId)
      .single();
    token = (fresh?.share_token as string | null) ?? token;
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(_req.url).origin;
  return NextResponse.json({ url: `${origin}/share/${token}`, token });
}
