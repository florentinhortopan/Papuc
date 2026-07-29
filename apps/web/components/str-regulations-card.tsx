"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { MarketStrIntelRow, StrRegulationStatus } from "@/lib/database.types";
import { formatMoney } from "@/lib/format";

const STATUS_LABEL: Record<StrRegulationStatus, string> = {
  permitted: "STR permitted",
  restricted: "STR restricted",
  banned: "STR banned",
  unclear: "Rules unclear",
};

const STATUS_VARIANT: Record<
  StrRegulationStatus,
  "success" | "warning" | "danger" | "muted"
> = {
  permitted: "success",
  restricted: "warning",
  banned: "danger",
  unclear: "muted",
};

/**
 * "STR rules in {city}" card for the deal detail page (STR strategy
 * only). Backed by the per-city `market_str_intel` cache — the fetch is
 * free when the scout already researched this market; on a cold cache
 * the route runs the web-search research (~30-45s), so the loading state
 * says so instead of looking hung.
 */
export function StrRegulationsCard({
  city,
  state,
}: {
  city: string;
  state: string;
}) {
  const [intel, setIntel] = useState<MarketStrIntelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/markets/str-intel?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`,
    )
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `intel failed (${res.status})`);
        if (!cancelled) setIntel(body.intel as MarketStrIntelRow);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city, state]);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-text text-base font-semibold">
          STR rules in {city}, {state}
        </p>
        {intel ? (
          <Badge variant={STATUS_VARIANT[intel.regulation_status]}>
            {STATUS_LABEL[intel.regulation_status]}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <p className="text-textMuted text-xs">
          Researching short-term rental rules for this market… first time can
          take up to a minute.
        </p>
      ) : error ? (
        <p className="text-textMuted text-xs">
          Could not load STR regulation info: {error}
        </p>
      ) : intel ? (
        <div className="space-y-3">
          {intel.regulation_summary ? (
            <p className="text-text text-sm leading-6">
              {intel.regulation_summary}
            </p>
          ) : null}

          {intel.permit_required !== null ? (
            <p className="text-textMuted text-xs">
              Permit/license required:{" "}
              <span className="text-text font-medium">
                {intel.permit_required ? "Yes" : "No"}
              </span>
            </p>
          ) : null}

          {intel.adr_low != null || intel.adr_high != null || intel.occupancy_avg != null ? (
            <p className="text-textMuted text-xs">
              Market reality check:{" "}
              {intel.adr_low != null && intel.adr_high != null
                ? `typical ADR ${formatMoney(intel.adr_low)}–${formatMoney(intel.adr_high)}/night`
                : intel.adr_median != null
                  ? `typical ADR ~${formatMoney(intel.adr_median)}/night`
                  : ""}
              {intel.occupancy_avg != null
                ? `${intel.adr_low != null || intel.adr_median != null ? ", " : ""}~${Math.round(intel.occupancy_avg * 100)}% average occupancy`
                : ""}
              {intel.seasonality_notes ? ` — ${intel.seasonality_notes}` : ""}
            </p>
          ) : null}

          {intel.resource_links.length > 0 ? (
            <div>
              <p className="text-textMuted text-xs mb-1">
                Permits, licenses and official resources
              </p>
              <ul className="space-y-1">
                {intel.resource_links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs hover:underline break-all"
                    >
                      {link.title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-textMuted text-[11px]">
            Researched {new Date(intel.researched_at).toLocaleDateString()} via
            web search — verify with the city/county before buying.
          </p>
        </div>
      ) : null}
    </div>
  );
}
