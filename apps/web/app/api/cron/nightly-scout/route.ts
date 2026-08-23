import { NextResponse } from "next/server";

import {
  sendScoutDigest,
  type DigestDeal,
  type DigestProject,
} from "@/lib/email/scout-digest";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoutProjectInternal } from "@/lib/scouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * TEMP email smoke-test knobs — revert after verifying Resend:
 * - DIGEST_MIN_SCORE was 70
 * - DIGEST_FALLBACK_EXISTING lets digests fire when the cheap nightly
 *   scout finds no brand-new listings
 */
const DIGEST_MIN_SCORE = 0;
const DIGEST_FALLBACK_EXISTING = true;
const DIGEST_FALLBACK_LIMIT = 5;

type OwnerDigestBucket = {
  projects: DigestProject[];
};

function toDigestDeal(d: {
  id: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  deal_scores?:
    | { score?: unknown; dscr?: unknown; monthly_cashflow?: unknown }
    | Array<{ score?: unknown; dscr?: unknown; monthly_cashflow?: unknown }>
    | null;
}): DigestDeal {
  const scores = Array.isArray(d.deal_scores) ? d.deal_scores[0] : d.deal_scores;
  return {
    id: d.id,
    address: d.address ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    score: Number(scores?.score ?? 0),
    dscr:
      scores?.dscr != null && Number.isFinite(Number(scores.dscr))
        ? Number(scores.dscr)
        : null,
    monthlyCashflow:
      scores?.monthly_cashflow != null &&
      Number.isFinite(Number(scores.monthly_cashflow))
        ? Number(scores.monthly_cashflow)
        : null,
  };
}

/**
 * Triggered by Vercel Cron (vercel.json -> 0 8 * * *) and authenticated by
 * the CRON_SECRET shared secret. For each active project with nightly scout
 * enabled, runs a scheduled scout for Pro owners, then emails one Resend
 * digest per owner when new high-score deals appeared.
 *
 * Pro-only (see scout-rules.json). Free owners and projects with
 * nightly_scout_enabled=false are skipped.
 */
export async function GET(req: Request) {
  // Vercel Cron also passes a Vercel-specific header `x-vercel-cron`, but the
  // simplest portable check is a Bearer token we set on the cron config in Vercel.
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data: projects, error: pErr } = await sb
    .from("projects")
    .select("id, owner_id, name, nightly_scout_enabled")
    .eq("status", "active");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const ownerIds = [
    ...new Set((projects ?? []).map((p: { owner_id: string }) => p.owner_id)),
  ];
  const tierByOwner = new Map<string, "free" | "pro">();
  const profileByOwner = new Map<
    string,
    { email: string | null; display_name: string | null }
  >();
  if (ownerIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, subscription_tier, email, display_name")
      .in("id", ownerIds);
    for (const row of profiles ?? []) {
      tierByOwner.set(
        row.id as string,
        row.subscription_tier === "pro" ? "pro" : "free",
      );
      profileByOwner.set(row.id as string, {
        email: (row.email as string | null) ?? null,
        display_name: (row.display_name as string | null) ?? null,
      });
    }
  }

  const summary: Array<{
    projectId: string;
    ok: boolean;
    newDeals: number;
    skipped?: boolean;
    error?: string;
  }> = [];

  /** Accumulate high-score new deals per owner for a single digest email. */
  const digestsByOwner = new Map<string, OwnerDigestBucket>();

  for (const proj of projects ?? []) {
    if (!proj.nightly_scout_enabled) {
      summary.push({
        projectId: proj.id,
        ok: true,
        newDeals: 0,
        skipped: true,
      });
      continue;
    }

    const subscriptionTier = tierByOwner.get(proj.owner_id) ?? "free";
    // Free tier: scheduled scout disabled in scout-rules.json (Pro wedge).
    if (subscriptionTier !== "pro") {
      summary.push({
        projectId: proj.id,
        ok: true,
        newDeals: 0,
        skipped: true,
      });
      continue;
    }

    try {
      const { data: pre } = await sb
        .from("deals")
        .select("id")
        .eq("project_id", proj.id);
      const preIds = new Set((pre ?? []).map((r: { id: string }) => r.id));

      await scoutProjectInternal(sb, proj.id, {
        triggerKind: "scheduled",
        triggeredBy: null,
        subscriptionTier,
      });

      const { data: post } = await sb
        .from("deals")
        .select(
          "id, address, city, state, deal_scores!inner(score, dscr, monthly_cashflow)",
        )
        .eq("project_id", proj.id);

      const mapped: DigestDeal[] = (post ?? []).map((d: any) =>
        toDigestDeal(d),
      );

      let digestDeals: DigestDeal[] = mapped
        .filter((d) => !preIds.has(d.id))
        .filter((d) => d.score >= DIGEST_MIN_SCORE)
        .sort((a, b) => b.score - a.score);

      // TEMP: if nightly found nothing new, still email top existing matches
      // so we can verify Resend end-to-end.
      if (DIGEST_FALLBACK_EXISTING && digestDeals.length === 0) {
        digestDeals = mapped
          .filter((d) => d.score >= DIGEST_MIN_SCORE)
          .sort((a, b) => b.score - a.score)
          .slice(0, DIGEST_FALLBACK_LIMIT);
      }

      if (digestDeals.length > 0) {
        let bucket = digestsByOwner.get(proj.owner_id);
        if (!bucket) {
          bucket = { projects: [] };
          digestsByOwner.set(proj.owner_id, bucket);
        }
        bucket.projects.push({
          projectId: proj.id,
          projectName: proj.name,
          deals: digestDeals,
        });
      }

      summary.push({
        projectId: proj.id,
        ok: true,
        newDeals: digestDeals.length,
      });
    } catch (err) {
      summary.push({
        projectId: proj.id,
        ok: false,
        newDeals: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const emails: Array<{
    ownerId: string;
    ok: boolean;
    messageId?: string;
    skipped?: boolean;
    error?: string;
  }> = [];

  for (const [ownerId, bucket] of digestsByOwner) {
    const profile = profileByOwner.get(ownerId);
    const to = profile?.email?.trim();
    if (!to) {
      emails.push({
        ownerId,
        ok: true,
        skipped: true,
        error: "no profile email",
      });
      continue;
    }
    try {
      const result = await sendScoutDigest({
        to,
        displayName: profile?.display_name,
        projects: bucket.projects,
      });
      if (!result) {
        emails.push({
          ownerId,
          ok: true,
          skipped: true,
          error: "resend not configured",
        });
        continue;
      }
      emails.push({ ownerId, ok: true, messageId: result.id });
    } catch (err) {
      emails.push({
        ownerId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ summary, emails });
}
