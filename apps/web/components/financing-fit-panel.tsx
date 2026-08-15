"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FinancingFitProfile, MatchedLender } from "@/lib/financing-fit";
import { formatMoney } from "@/lib/format";

export type FinancingFitAdvicePayload = {
  headline: string;
  pathSummary: string;
  lenderNotes: Array<{ lenderId: string; note: string }>;
  nextSteps: string[];
  disclaimer: string;
};

type FinancingFitResponse = {
  matches: MatchedLender[];
  profileSummary: string[];
  advice: FinancingFitAdvicePayload;
  needsHardMoneyOrCashPath?: boolean;
  needsLowDownPath?: boolean;
  needsSubOneDscr?: boolean;
  needsRehabPath?: boolean;
  error?: string;
};

/**
 * Click-gated financing-fit agent: matches curated lenders to the live
 * scenario, then (when Anthropic is configured) drafts next-step advice.
 */
export function FinancingFitPanel({
  dealId,
  profile,
}: {
  dealId: string;
  profile: FinancingFitProfile;
}) {
  const [result, setResult] = useState<FinancingFitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/financing-fit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const body = (await res.json()) as FinancingFitResponse;
      if (!res.ok) throw new Error(body.error ?? `financing-fit ${res.status}`);
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-text text-base font-semibold mb-1">Financing fit</p>
        <p className="text-textMuted text-xs mb-3 leading-5">
          Match lenders to this scenario’s location, DSCR, down payment, and
          rehab needs — then get suggested next steps for buying.
        </p>
        <p className="text-textMuted text-[11px] mb-3">
          Using {formatMoney(profile.price)} ·{" "}
          {Math.round(profile.ltv * 100)}% LTV · DSCR{" "}
          {profile.dscrLenderHaircut.toFixed(2)} (lender haircut)
          {profile.rehabBudget > 0
            ? ` · rehab ~${formatMoney(profile.rehabBudget)}`
            : ""}
        </p>
        {error ? <p className="text-danger text-xs mb-2">{error}</p> : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void run()}
          loading={loading}
        >
          Find financing fit
        </Button>
      </div>
    );
  }

  const noteById = new Map(
    result.advice.lenderNotes.map((n) => [n.lenderId, n.note]),
  );

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-text text-base font-semibold">Financing fit</p>
          <p className="text-text text-sm mt-1">{result.advice.headline}</p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="text-primary text-xs hover:underline disabled:opacity-60 shrink-0"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Refresh"
          )}
        </button>
      </div>

      <p className="text-textMuted text-sm leading-6">{result.advice.pathSummary}</p>

      {result.profileSummary?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {result.profileSummary.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </div>
      ) : null}

      {result.matches.length === 0 ? (
        <p className="text-textMuted text-xs">
          No lenders cleared the filters for this scenario.
        </p>
      ) : (
        <div className="space-y-2">
          {result.matches.map((m) => (
            <a
              key={m.lender.id}
              href={m.lender.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-surfaceAlt border border-border rounded-xl p-3 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-text text-sm font-semibold">{m.lender.name}</p>
                <span className="text-textMuted text-[11px] shrink-0">
                  fit {m.score}
                </span>
              </div>
              <p className="text-textMuted text-xs mt-1 leading-5">
                {noteById.get(m.lender.id) ??
                  m.fitReasons[0] ??
                  m.lender.notes}
              </p>
              {m.cautionReasons[0] ? (
                <p className="text-warning text-[11px] mt-1">{m.cautionReasons[0]}</p>
              ) : null}
              <div className="flex flex-wrap gap-1 mt-2">
                {m.suggestedPrograms.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] uppercase tracking-wide text-textMuted border border-border rounded-full px-1.5 py-0.5"
                  >
                    {p.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}

      {result.advice.nextSteps.length ? (
        <div>
          <p className="text-text text-xs font-semibold mb-1.5">Next steps</p>
          <ol className="list-decimal list-inside space-y-1">
            {result.advice.nextSteps.map((step) => (
              <li key={step} className="text-textMuted text-xs leading-5">
                {step}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="text-textMuted text-[10px] leading-4">
        {result.advice.disclaimer}
      </p>

      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}
