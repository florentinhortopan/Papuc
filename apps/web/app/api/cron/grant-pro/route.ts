import { NextResponse } from "next/server";

import {
  setAllSubscriptionTiers,
  setSubscriptionTierByEmail,
} from "@/lib/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot ops helper: set profiles.subscription_tier.
 * Auth: Authorization Bearer CRON_SECRET (same as nightly scout).
 *
 * GET/POST /api/cron/grant-pro?email=user@example.com
 * GET/POST /api/cron/grant-pro?all=1
 * Optional: &tier=free to revoke (default pro).
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
  let tierParam = url.searchParams.get("tier")?.trim().toLowerCase() ?? "pro";
  let grantAll =
    url.searchParams.get("all") === "1" ||
    url.searchParams.get("all") === "true";

  if (req.method === "POST") {
    try {
      const body = (await req.json()) as {
        email?: string;
        tier?: string;
        all?: boolean;
      };
      if (!email) email = body.email?.trim().toLowerCase() ?? "";
      if (body.tier) tierParam = body.tier.trim().toLowerCase();
      if (body.all) grantAll = true;
    } catch {
      /* ignore */
    }
  }

  const tier = tierParam === "free" ? "free" : "pro";

  try {
    if (grantAll) {
      const result = await setAllSubscriptionTiers(tier);
      return NextResponse.json({ ok: true, tier, ...result });
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "email required (or all=1)" },
        { status: 400 },
      );
    }

    const result = await setSubscriptionTierByEmail(email, tier);
    if (!result.found) {
      return NextResponse.json(
        { error: "profile not found", email },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      tier,
      before: result.before,
      after: result.after,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
