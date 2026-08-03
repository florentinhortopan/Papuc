import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import type { DealScoresRow, DealsRow } from "@/lib/database.types";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Public, no-login share page — the landing surface of the share loop.
 *
 * Funnel design (why the page looks the way it does):
 *   1. The link unfurls in iMessage/WhatsApp/Slack with the property photo
 *      and the cashflow headline (OG tags below) — the share *itself* is
 *      the ad.
 *   2. Anonymous visitors get the hook for free: photos, price, and the
 *      three verdict numbers the sender wants to talk about. No paywall on
 *      the conversation piece.
 *   3. The *underwriting* (full cost breakdown, 5-yr returns, break-even
 *      solvers, scenario simulator) renders blurred behind a single CTA:
 *      sign in with Google, land right back on this page (`?next=`),
 *      unlocked. One tap, no form.
 *   4. Unlocked visitors immediately see the "scout your own market"
 *      CTA — the actual product — turning recipients into senders.
 */

type SharedDeal = DealsRow & {
  deal_scores: DealScoresRow[] | DealScoresRow | null;
  projects: { owner_id: string; constraints: { strategy?: string } | null } | null;
};

const getSharedDeal = cache(async (token: string) => {
  // Tokens are 72-bit random slugs minted on first share; possession is
  // authorization, so this read uses the service role (anon RLS would
  // return nothing) but only ever by exact token match.
  if (!token || token.length < 8 || token.length > 64) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deals")
    .select("*, deal_scores(*), projects(owner_id, constraints)")
    .eq("share_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as SharedDeal;
});

function pickScore(deal: SharedDeal): DealScoresRow | null {
  const s = deal.deal_scores;
  if (!s) return null;
  return Array.isArray(s) ? (s[0] ?? null) : s;
}

function photosOf(deal: SharedDeal): string[] {
  if (Array.isArray(deal.photos) && deal.photos.length) {
    return (deal.photos as string[]).filter((p) => typeof p === "string");
  }
  return deal.primary_image_url ? [deal.primary_image_url] : [];
}

function addressLine(deal: SharedDeal): string {
  return (
    deal.address ??
    [deal.city, deal.state].filter(Boolean).join(", ") ??
    "Investment property"
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const deal = await getSharedDeal(token);
  if (!deal) return { title: "Shared deal — Papuc" };

  const score = pickScore(deal);
  const cashflow = score?.monthly_cashflow;
  const headline =
    cashflow != null
      ? `${cashflow >= 0 ? "+" : ""}${formatMoney(cashflow)}/mo cashflow`
      : "Rental deal analysis";
  const title = `${headline} · ${addressLine(deal)}`;
  const description = [
    deal.price ? `List ${formatMoney(deal.price)}` : null,
    deal.beds != null ? `${deal.beds} bd` : null,
    deal.baths != null ? `${deal.baths} ba` : null,
    score?.dscr != null ? `DSCR ${formatDscr(score.dscr)}` : null,
    "Full pro-forma underwriting by Papuc, the AI deal scout.",
  ]
    .filter(Boolean)
    .join(" · ");
  const image = photosOf(deal)[0];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const deal = await getSharedDeal(token);
  if (!deal) notFound();

  const score = pickScore(deal);
  const photos = photosOf(deal).slice(0, 5);
  const strategy = deal.projects?.constraints?.strategy ?? "LTR";
  const assumedAdr = score?.score_components?.adr;

  // Signed-in visitors get the underwriting unlocked in place; the deal's
  // owner additionally gets a deep link into the app.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = user !== null;
  const isOwner = signedIn && user.id === deal.projects?.owner_id;
  const signUpHref = `/sign-in?next=${encodeURIComponent(`/share/${token}`)}`;

  const cashflow = score?.monthly_cashflow;
  const facts = [
    deal.beds != null ? `${deal.beds} bd` : null,
    deal.baths != null ? `${deal.baths} ba` : null,
    deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : null,
    deal.hoa_monthly != null && deal.hoa_monthly > 0
      ? `HOA ${formatMoney(deal.hoa_monthly)}/mo`
      : null,
    deal.days_on_market != null ? `${deal.days_on_market} days on market` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="font-bold text-lg">
            Papuc{" "}
            <span className="text-textMuted font-normal text-xs">
              AI deal scout
            </span>
          </p>
          {signedIn ? (
            <Link href="/projects" className="text-primary text-sm hover:underline">
              My projects →
            </Link>
          ) : (
            <Link href={signUpHref} className="text-primary text-sm hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <p className="text-textMuted text-xs">
          Someone shared this deal analysis with you.
        </p>

        {photos.length > 0 ? (
          <div
            className={`grid gap-1.5 rounded-2xl overflow-hidden ${
              photos.length > 1 ? "grid-cols-[2fr,1fr]" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0]}
              alt={addressLine(deal)}
              className="w-full h-64 sm:h-80 object-cover"
            />
            {photos.length > 1 ? (
              <div className="grid gap-1.5">
                {photos.slice(1, 3).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p}
                    src={p}
                    alt=""
                    className="w-full h-[calc(8rem-3px)] sm:h-[calc(10rem-3px)] object-cover"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{addressLine(deal)}</h1>
          <p className="text-textMuted text-sm mt-1">
            {[deal.city, deal.state, deal.zip].filter(Boolean).join(", ")}
            {facts.length ? ` · ${facts.join(" · ")}` : ""}
          </p>
          <p className="text-text text-lg font-semibold mt-2">
            {deal.price
              ? `${formatMoney(deal.price)} list`
              : deal.est_value
                ? `${formatMoney(deal.est_value)} est. value`
                : ""}
            {strategy === "STR" && assumedAdr ? (
              <span className="text-textMuted text-sm font-normal">
                {" "}
                · underwritten at {formatMoney(assumedAdr)}/night
              </span>
            ) : null}
          </p>
        </div>

        {/* The free hook: verdict numbers the sender wants to discuss. */}
        <div className="grid grid-cols-3 gap-2">
          <VerdictTile
            label="Monthly cashflow"
            value={
              cashflow != null
                ? `${cashflow >= 0 ? "+" : ""}${formatMoney(cashflow)}`
                : "—"
            }
            tone={
              cashflow == null ? "muted" : cashflow >= 100 ? "good" : cashflow >= -100 ? "warn" : "bad"
            }
          />
          <VerdictTile
            label="DSCR"
            value={score?.dscr != null ? formatDscr(score.dscr) : "—"}
            tone={
              score?.dscr == null ? "muted" : score.dscr >= 1.1 ? "good" : "warn"
            }
          />
          <VerdictTile
            label="Cash-on-cash"
            value={score?.cash_on_cash != null ? formatPct(score.cash_on_cash) : "—"}
            tone="muted"
          />
        </div>

        {score?.rationale ? (
          <div className="bg-surface border border-border rounded-2xl p-4">
            <p className="text-textMuted text-xs mb-1">Why the scout flagged it</p>
            <p className="text-text text-sm leading-6">{score.rationale}</p>
          </div>
        ) : null}

        {/* The gate: full underwriting, blurred until signed in. */}
        <div className="bg-surface border border-border rounded-2xl p-4 relative overflow-hidden">
          <p className="text-text text-base font-semibold mb-3">
            Full underwriting
          </p>
          <div
            className={
              signedIn ? "space-y-1.5" : "space-y-1.5 blur-sm select-none pointer-events-none"
            }
            aria-hidden={!signedIn}
          >
            <LockedRow
              label="5-yr IRR"
              value={score?.irr_5yr != null ? formatPct(score.irr_5yr) : "—"}
            />
            <LockedRow
              label="Payout (years)"
              value={score?.payout_years != null ? String(score.payout_years) : "—"}
            />
            <LockedRow
              label="DSCR at lender 75% rent haircut"
              value={
                score?.dscr_lender_haircut != null
                  ? formatDscr(score.dscr_lender_haircut)
                  : "—"
              }
            />
            <LockedRow label="Monthly PITIA breakdown" value="P&I · taxes · insurance · HOA · PMI" />
            <LockedRow
              label={strategy === "STR" ? "Break-even nightly rate" : "Break-even rent & price"}
              value="Scenario simulator"
            />
            <LockedRow label="Cost assumptions" value="Editable pro-forma, every line item" />
          </div>

          {!signedIn ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <div className="text-center px-6">
                <p className="text-text text-sm font-medium mb-3">
                  Sign in free to unlock the full underwriting
                  <br />
                  <span className="text-textMuted text-xs font-normal">
                    and stress-test the numbers yourself — one tap with Google.
                  </span>
                </p>
                <Link
                  href={signUpHref}
                  className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:opacity-90"
                >
                  Unlock this analysis
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {/* Turn recipients into senders. */}
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 text-center">
          <p className="text-text text-base font-semibold">
            Papuc found and underwrote this deal automatically.
          </p>
          <p className="text-textMuted text-sm mt-1 leading-6">
            Describe your goal in plain English — “$500/mo cashflow in Austin
            under $450k” — and Papuc scouts listings nightly, runs this exact
            pro-forma on every one, and ranks what clears your bar.
          </p>
          <Link
            href={isOwner ? `/deals/${deal.id}` : signedIn ? "/projects" : signUpHref}
            className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 mt-4 hover:opacity-90"
          >
            {isOwner
              ? "Open in your workspace"
              : signedIn
                ? "Scout your own market"
                : "Start scouting free"}
          </Link>
        </div>

        <p className="text-textMuted text-[11px] leading-5 text-center pb-6">
          DSCR and cashflow figures are investor underwriting estimates
          computed from public listing data and stated assumptions — not
          lender quotes or investment advice.
        </p>
      </div>
    </main>
  );
}

function VerdictTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const toneClass =
    tone === "good"
      ? "text-success"
      : tone === "warn"
        ? "text-warning"
        : tone === "bad"
          ? "text-danger"
          : "text-text";
  return (
    <div className="bg-surface border border-border rounded-2xl p-3 text-center">
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      <p className="text-textMuted text-[11px] mt-0.5">{label}</p>
    </div>
  );
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-textMuted">{label}</span>
      <span className="text-text font-medium text-right">{value}</span>
    </div>
  );
}
