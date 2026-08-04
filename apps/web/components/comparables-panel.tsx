"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  scoutComparables,
  type ComparableListing,
  type ScoutComparablesInput,
} from "@/lib/comparables";
import { formatMoney } from "@/lib/format";

export function ComparablesPanel({
  dealId,
  projectId,
  scenario,
}: {
  dealId: string;
  projectId: string;
  /** Live editor / scenario values — drives the HasData price band. */
  scenario: ScoutComparablesInput;
}) {
  const [comps, setComps] = useState<ComparableListing[] | null>(null);
  const [meta, setMeta] = useState<{ added: number; refreshed: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const result = await scoutComparables(dealId, {
        price: scenario.price,
        beds: scenario.beds,
        baths: scenario.baths,
        sqft: scenario.sqft,
      });
      setComps(result.comparables);
      setMeta({ added: result.added, refreshed: result.refreshed });
      setNote(result.note ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!comps) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-text text-base font-semibold mb-2">Comparables</p>
        {error ? (
          <p className="text-danger text-xs mb-2">{error}</p>
        ) : (
          <p className="text-textMuted text-xs mb-3">
            Scout nearby for-sale comps with HasData using your current
            scenario price
            {scenario.price ? ` (${formatMoney(scenario.price)})` : ""}. New
            matches are added to this project without duplicates.
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          Scout comparables
        </Button>
      </div>
    );
  }

  if (comps.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-text text-base font-semibold mb-2">Comparables</p>
        <p className="text-textMuted text-xs mb-3">
          {note ?? "No comparables returned."}
        </p>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-text text-base font-semibold">Comparables</p>
        <button
          onClick={load}
          disabled={loading}
          className="text-primary text-xs hover:underline disabled:opacity-60"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>
      {meta ? (
        <p className="text-textMuted text-[11px] mb-3">
          {meta.added} added · {meta.refreshed} already in project
          {scenario.price ? ` · band around ${formatMoney(scenario.price)}` : ""}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {comps.map((c) => (
          <Link
            key={c.id}
            href={`/projects/${projectId}/deals/${c.id}`}
            className="flex items-center bg-surfaceAlt border border-border rounded-xl p-2 gap-3 hover:border-primary/40 transition-colors"
          >
            {c.primaryListingImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.primaryListingImageUrl}
                alt=""
                className="w-16 h-16 rounded-lg object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-surface flex items-center justify-center">
                <span className="text-textMuted text-[10px]">no img</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-text text-sm truncate">
                {c.address ?? "Address pending"}
              </p>
              <p className="text-textMuted text-xs mt-0.5">
                {[
                  c.beds ? `${c.beds} bd` : null,
                  c.baths ? `${c.baths} ba` : null,
                  c.sqft ? `${Math.round(c.sqft)} sqft` : null,
                  c.distanceMiles != null
                    ? `${c.distanceMiles.toFixed(1)} mi`
                    : null,
                  c.alreadyInProject ? "in project" : "new",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-text text-sm font-semibold mt-1">
                {c.price ? formatMoney(c.price) : "—"}
                {c.papucScore != null ? (
                  <span className="text-textMuted font-normal text-xs ml-2">
                    score {c.papucScore}
                  </span>
                ) : null}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
