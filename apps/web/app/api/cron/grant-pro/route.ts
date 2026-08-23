import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot ops helper: set profiles.subscription_tier = pro for an email.
 * Auth: Authorization Bearer CRON_SECRET (same as nightly scout).
 *
 * GET/POST /api/cron/grant-pro?email=user@example.com
 */
export async function GET(req: Request) {
  return grant(req);
}

export async function POST(req: Request) {
  return grant(req);
}

async function grant(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email && req.method === "POST") {
    try {
      const body = (await req.json()) as { email?: string };
      email = body.email?.trim().toLowerCase() ?? "";
    } catch {
      /* ignore */
    }
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: before, error: findErr } = await sb
    .from("profiles")
    .select("id, email, subscription_tier")
    .eq("email", email);
  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!before?.length) {
    return NextResponse.json(
      { error: "profile not found", email },
      { status: 404 },
    );
  }

  const { data: after, error: updErr } = await sb
    .from("profiles")
    .update({ subscription_tier: "pro" })
    .eq("email", email)
    .select("id, email, subscription_tier");
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    before: before[0],
    after: after?.[0] ?? null,
  });
}
