import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { scoutProjectInternal } from "@/lib/scouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Triggered by Vercel Cron (vercel.json -> 0 8 * * *) and authenticated by
 * the CRON_SECRET shared secret. For each active project, runs a full scout
 * and surfaces any new high-score deals back to the project owner.
 *
 * NOTE: web push / email notifications are not yet wired up on the web port;
 * for now we just persist the new deals so they show up on next page load.
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
    .select("id, owner_id, name")
    .eq("status", "active");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const summary: Array<{
    projectId: string;
    ok: boolean;
    newDeals: number;
    error?: string;
  }> = [];

  for (const proj of projects ?? []) {
    try {
      const { data: pre } = await sb
        .from("deals")
        .select("id")
        .eq("project_id", proj.id);
      const preIds = new Set((pre ?? []).map((r: any) => r.id));

      await scoutProjectInternal(sb, proj.id, {
        triggerKind: "scheduled",
        triggeredBy: null,
      });

      const { data: post } = await sb
        .from("deals")
        .select("id, address, deal_scores!inner(score)")
        .eq("project_id", proj.id);
      const newOnes = (post ?? [])
        .filter((d: any) => !preIds.has(d.id))
        .map((d: any) => ({
          id: d.id,
          score: Number(
            d.deal_scores?.[0]?.score ?? d.deal_scores?.score ?? 0,
          ),
        }))
        .filter((d: any) => d.score >= 70);

      summary.push({
        projectId: proj.id,
        ok: true,
        newDeals: newOnes.length,
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

  return NextResponse.json({ summary });
}
