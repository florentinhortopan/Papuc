import type { ProjectConstraints, StrMarketAdrIntel } from "@papuc/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import type { DealScoresRow, DealsRow } from "@/lib/database.types";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { getCachedMarketStrIntel } from "@/lib/str-intel";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { underwriteDeal } from "@/lib/underwrite";
import { ScoutLikeThisButton } from "@/components/scout-like-this-button";

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
  projects: {
    owner_id: string;
    constraints: ProjectConstraints | null;
  } | null;
};

/**
 * Fetch the shared deal AND underwrite it live. The stored deal_scores
 * row reflects the cost model at scout time and goes stale whenever the
 * model improves — quoting it here once showed recipients a higher
 * cashflow than the owner's own detail page. Everything numeric on this
 * page comes from `underwriteDeal` (the same helper that seeds the
 * detail editor); the stored score is only used for the rationale text.
 */
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
  const deal = data as unknown as SharedDeal;

  const constraints = deal.projects?.constraints;
  if (!constraints) return null;

  // Same cached market ADR intel the scout and detail page underwrite
  // STR deals with (cache read only — a public page must never trigger
  // paid research).
  let marketAdrIntel: StrMarketAdrIntel | null = null;
  if (constraints.strategy === "STR" && deal.city && deal.state) {
    const intel = await getCachedMarketStrIntel(admin, deal.city, deal.state);
    if (intel) {
      marketAdrIntel = {
        adrLow: intel.adr_low ?? undefined,
        adrMedian: intel.adr_median ?? undefined,
        adrHigh: intel.adr_high ?? undefined,
        occupancyAvg: intel.occupancy_avg ?? undefined,
      };
    }
  }

  const { seeds, result } = underwriteDeal(deal, constraints, marketAdrIntel);
  return { deal, seeds, result };
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
  const shared = await getSharedDeal(token);
  if (!shared) return { title: "Shared deal — Papuc" };
  const { deal, result } = shared;

  const cashflow = result.annualPreTaxProfit / 12;
  const addr = addressLine(deal);
  // Keep OG title/description short — WhatsApp/Telegram truncate aggressively
  // and long titles crowd out the image card.
  const cashLabel = `${cashflow >= 0 ? "+" : ""}${formatMoney(cashflow)}/mo`;
  const title = `${cashLabel} · ${addr}`;
  const description = [
    deal.price ? `${formatMoney(deal.price)} list` : null,
    deal.beds != null ? `${deal.beds} bd` : null,
    deal.baths != null ? `${deal.baths} ba` : null,
    `DSCR ${formatDscr(result.dscr)}`,
    "Underwritten on Papuc",
  ]
    .filter(Boolean)
    .join(" · ");

  const site = getSiteUrl();
  const hasPhoto =
    photosOf(deal).length > 0 || Boolean(deal.primary_image_url);
  const ogImage = `${site}/api/og/deal/${token}`;

  return {
    title,
    description,
    metadataBase: new URL(site),
    openGraph: {
      title: cashLabel,
      description: `${addr} · ${description}`,
      type: "website",
      url: `${site}/share/${token}`,
      siteName: "Papuc",
      ...(hasPhoto
        ? {
            images: [
              {
                url: ogImage,
                width: 1200,
                height: 800,
                alt: addr,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: hasPhoto ? "summary_large_image" : "summary",
      title: cashLabel,
      description: `${addr} · ${description}`,
      ...(hasPhoto ? { images: [ogImage] } : {}),
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getSharedDeal(token);
  if (!shared) notFound();
  const { deal, seeds, result } = shared;

  const score = pickScore(deal);
  const photos = photosOf(deal).slice(0, 5);
  const strategy = seeds.strategy;
  const assumedAdr = seeds.strSchedule?.monthlyADR[0];

  // Signed-in visitors get the underwriting unlocked in place; the deal's
  // owner additionally gets a deep link into the app.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = user !== null;
  const isOwner = signedIn && user.id === deal.projects?.owner_id;
  const signUpHref = `/sign-in?next=${encodeURIComponent(`/share/${token}`)}`;

  const cashflow = result.annualPreTaxProfit / 12;
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

        {/* The free hook: verdict numbers, underwritten live with the
            current cost model — identical to the owner's detail page. */}
        <div className="grid grid-cols-3 gap-2">
          <VerdictTile
            label="Monthly cashflow"
            value={`${cashflow >= 0 ? "+" : ""}${formatMoney(cashflow)}`}
            tone={cashflow >= 100 ? "good" : cashflow >= -100 ? "warn" : "bad"}
          />
          <VerdictTile
            label="DSCR"
            value={formatDscr(result.dscr)}
            tone={result.dscr >= 1.1 ? "good" : "warn"}
          />
          <VerdictTile
            label="Cash-on-cash"
            value={formatPct(result.cashOnCashReturn)}
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
              value={result.irr5Yr !== null ? formatPct(result.irr5Yr) : "—"}
            />
            <LockedRow
              label="Payout (years)"
              value={
                Number.isFinite(result.payoutYears)
                  ? result.payoutYears.toFixed(1)
                  : "—"
              }
            />
            <LockedRow
              label="DSCR at lender 75% rent haircut"
              value={formatDscr(result.dscrLenderHaircut)}
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
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 text-center space-y-3">
          <p className="text-text text-base font-semibold">
            Papuc found and underwrote this deal automatically.
          </p>
          <p className="text-textMuted text-sm leading-6">
            Clone these scout filters into your own project — same markets and
            strategy — then run nightly finds that clear your bar.
          </p>
          {isOwner ? (
            <Link
              href={`/deals/${deal.id}`}
              className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:opacity-90"
            >
              Open in your workspace
            </Link>
          ) : signedIn ? (
            <div className="flex flex-col items-center gap-2">
              <ScoutLikeThisButton
                dealId={deal.id}
                label="Scout like this"
              />
              <Link
                href="/projects"
                className="text-primary text-xs hover:underline"
              >
                Or go to my projects
              </Link>
            </div>
          ) : (
            <Link
              href={signUpHref}
              className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:opacity-90"
            >
              Start scouting free
            </Link>
          )}
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
