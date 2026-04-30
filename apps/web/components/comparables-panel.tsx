"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchComparables, type ComparableListing } from "@/lib/comparables";
import { formatMoney } from "@/lib/format";

export function ComparablesPanel({ dealId }: { dealId: string }) {
  const [comps, setComps] = useState<ComparableListing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setComps(await fetchComparables(dealId));
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
            Pull recent comps from RealEstateAPI for this property.
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          Load comparables
        </Button>
      </div>
    );
  }

  if (comps.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-text text-base font-semibold mb-2">Comparables</p>
        <p className="text-textMuted text-xs">No comparables returned.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-text text-base font-semibold">Comparables</p>
        <button
          onClick={load}
          disabled={loading}
          className="text-primary text-xs hover:underline disabled:opacity-60"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {comps.map((c) => (
          <div
            key={c.id}
            className="flex items-center bg-surfaceAlt border border-border rounded-xl p-2 gap-3"
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
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-text text-sm font-semibold mt-1">
                {c.price ? formatMoney(c.price) : "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
