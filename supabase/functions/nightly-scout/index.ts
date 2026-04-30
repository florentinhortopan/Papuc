// Edge Function: nightly-scout
// Triggered by pg_cron via service-role key.
// 1. Snapshot existing top-scored deals per active project
// 2. Fan out to scout-project for each
// 3. Detect new high-score deals (score >= 70 by default) and push notify the project owner

import { jsonResponse } from "../_shared/cors.ts";
import { sendExpoPush } from "../_shared/expoPush.ts";
import { getServiceClient } from "../_shared/supabase.ts";

const HIGH_SCORE_THRESHOLD = 70;

Deno.serve(async (req: Request) => {
  // Only allow service-role
  const auth = req.headers.get("authorization") ?? "";
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !auth.includes(expected)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const sb = getServiceClient();
  const { data: projects, error: pErr } = await sb
    .from("projects")
    .select("id, owner_id, name")
    .eq("status", "active");
  if (pErr) return jsonResponse({ error: pErr.message }, 500);

  const summary: Array<{ projectId: string; ok: boolean; newDeals: number; error?: string }> = [];

  for (const proj of projects ?? []) {
    try {
      // Snapshot pre-existing deal IDs so we can detect new ones after the scout.
      const { data: pre } = await sb
        .from("deals")
        .select("id")
        .eq("project_id", proj.id);
      const preIds = new Set((pre ?? []).map((r: any) => r.id));

      // Run the scout-project Edge Function via internal HTTP call.
      const url = Deno.env.get("SUPABASE_URL");
      if (!url) throw new Error("SUPABASE_URL not set");
      const res = await fetch(`${url}/functions/v1/scout-project`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${expected}`,
        },
        body: JSON.stringify({ projectId: proj.id }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`scout-project ${res.status}: ${t.slice(0, 200)}`);
      }

      // Find deals added during this run + their scores
      const { data: post } = await sb
        .from("deals")
        .select("id, address, deal_scores!inner(score, dscr, monthly_cashflow)")
        .eq("project_id", proj.id);
      const newOnes = (post ?? [])
        .filter((d: any) => !preIds.has(d.id))
        .map((d: any) => ({
          id: d.id,
          address: d.address ?? "New deal",
          score: Number(d.deal_scores?.[0]?.score ?? d.deal_scores?.score ?? 0),
          dscr: Number(d.deal_scores?.[0]?.dscr ?? d.deal_scores?.dscr ?? 0),
          monthlyCashflow: Number(
            d.deal_scores?.[0]?.monthly_cashflow ?? d.deal_scores?.monthly_cashflow ?? 0,
          ),
        }))
        .filter((d: any) => d.score >= HIGH_SCORE_THRESHOLD);

      if (newOnes.length > 0) {
        const { data: tokens } = await sb
          .from("device_tokens")
          .select("token")
          .eq("user_id", proj.owner_id);
        if (tokens && tokens.length > 0) {
          const top = newOnes.sort((a: any, b: any) => b.score - a.score)[0];
          await sendExpoPush(
            tokens.map((t: any) => ({
              to: t.token as string,
              title: `${newOnes.length} new deal${newOnes.length === 1 ? "" : "s"} for ${proj.name}`,
              body: `Top match: ${top.address} · DSCR ${top.dscr.toFixed(2)} · ${
                top.monthlyCashflow >= 0 ? "+" : ""
              }$${Math.round(top.monthlyCashflow)}/mo`,
              sound: "default",
              data: { projectId: proj.id },
            })),
          );
        }
      }

      summary.push({ projectId: proj.id, ok: true, newDeals: newOnes.length });
    } catch (err) {
      summary.push({
        projectId: proj.id,
        ok: false,
        newDeals: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return jsonResponse({ summary });
});
