"use client";

import {
  PROPERTY_TYPE_LABELS,
  PROJECT_USE_CASE_LABELS,
  type Market,
  type ProjectConstraints,
  type ProjectUseCase,
  type PropertyType,
} from "@papuc/core";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Property types we offer in the review UI. `any` is intentionally last so
 * the user reads through the specific categories first; selecting it
 * clears the others (and vice versa) to keep the request semantically
 * coherent on the API side.
 */
const PROPERTY_TYPE_OPTIONS: PropertyType[] = [
  "single_family",
  "condo",
  "townhouse",
  "multi_family_2_4",
  "multi_family_5_plus",
  "manufactured",
  "land",
  "mixed_use",
  "commercial",
  "any",
];

function strategyArcLabel(
  arc: NonNullable<NonNullable<ProjectConstraints["intent"]>["strategyArc"]>,
): string {
  const phase = (p: string) =>
    p === "owner"
      ? "Live / owner-occupy"
      : p === "STR"
        ? "Short-term rental"
        : "Long-term rental";
  if (arc.later) return `${phase(arc.nearTerm)} → then ${phase(arc.later)}`;
  return phase(arc.nearTerm);
}

function WhatWeUnderstood({ constraints }: { constraints: ProjectConstraints }) {
  const intent = constraints.intent;
  if (!intent) return null;

  const chips: string[] = [];
  if (intent.household?.total) chips.push(`Household ${intent.household.total}`);
  if (constraints.bedsMin != null) chips.push(`≥ ${constraints.bedsMin} beds`);
  if (intent.horizonYears != null)
    chips.push(`${intent.horizonYears}-year horizon`);
  if (intent.capitalStory) chips.push(intent.capitalStory);
  for (const t of intent.placeTags ?? []) chips.push(t);
  for (const t of intent.mustHaves ?? []) chips.push(`Must: ${t}`);

  return (
    <Section title="What we understood">
      <div className="bg-surfaceAlt border border-border rounded-2xl p-4 mb-3">
        {intent.summary ? (
          <p className="text-sm text-text mb-3">{intent.summary}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 mb-3">
          {intent.useCase ? (
            <span className="rounded-full bg-primary/15 border border-primary/40 text-primary px-3 py-1 text-xs font-semibold">
              {PROJECT_USE_CASE_LABELS[intent.useCase as ProjectUseCase] ??
                intent.useCase}
            </span>
          ) : null}
          {intent.strategyArc ? (
            <span className="rounded-full bg-surface border border-border px-3 py-1 text-xs font-medium text-text">
              {strategyArcLabel(intent.strategyArc)}
            </span>
          ) : null}
        </div>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-lg bg-surface border border-border px-2 py-0.5 text-[11px] text-textMuted"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
        {intent.inferredMarkets ? (
          <p className="text-textMuted text-xs mb-2">{intent.inferredMarkets}</p>
        ) : null}
        {(intent.warnings ?? []).length > 0 ? (
          <ul className="space-y-1">
            {intent.warnings!.map((w) => (
              <li
                key={w}
                className="text-xs text-amber-800 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2 py-1.5"
              >
                {w}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}

export function ConstraintReview({
  name,
  setName,
  constraints,
  setConstraints,
  onBack,
  onSave,
  saving,
  error,
  title = "Review constraints",
  subtitle = "The agent extracted these. Tweak anything before saving.",
  saveLabel = "Create project",
  showName = true,
  showFooter = true,
  compact = false,
}: {
  name: string;
  setName: (v: string) => void;
  constraints: ProjectConstraints;
  setConstraints: (c: ProjectConstraints) => void;
  onBack?: () => void;
  onSave?: () => void;
  saving?: boolean;
  error?: string | null;
  title?: string;
  subtitle?: string;
  saveLabel?: string;
  /** When false, hide project name field (project page already has rename). Default true. */
  showName?: boolean;
  /** When false, hide Back/Save footer (parent supplies actions). Default true. */
  showFooter?: boolean;
  /** Use h2 instead of h1 for nested panels. Default false. */
  compact?: boolean;
}) {
  function patch<K extends keyof ProjectConstraints>(
    k: K,
    v: ProjectConstraints[K],
  ) {
    setConstraints({ ...constraints, [k]: v });
  }
  function patchMortgage<K extends keyof ProjectConstraints["mortgage"]>(
    k: K,
    v: ProjectConstraints["mortgage"][K],
  ) {
    setConstraints({
      ...constraints,
      mortgage: { ...constraints.mortgage, [k]: v },
    });
  }

  function updateMarketAt(index: number, city: string, state: string) {
    const st = state.toUpperCase();
    const markets = [...constraints.markets];
    markets[index] = city.trim()
      ? { kind: "city", city, state: st || "CA" }
      : { kind: "state", state: st || "CA" };
    patch("markets", markets);
  }

  function removeMarketAt(index: number) {
    if (constraints.markets.length <= 1) return;
    patch(
      "markets",
      constraints.markets.filter((_, i) => i !== index),
    );
  }

  function addMarket() {
    if (constraints.markets.length >= 5) return;
    patch("markets", [
      ...constraints.markets,
      { kind: "city", city: "", state: "CA" },
    ]);
  }

  /**
   * Toggle a property type chip. `any` is mutually exclusive with the
   * specific types: turning it on clears the rest; turning on any
   * specific type clears `any`. Schema also enforces at least one entry,
   * so if the user tries to deselect the last chip we keep it.
   */
  function togglePropertyType(t: PropertyType) {
    const cur = constraints.propertyTypes;
    let next: PropertyType[];
    if (t === "any") {
      next = cur.includes("any") ? [] : ["any"];
    } else if (cur.includes(t)) {
      next = cur.filter((x) => x !== t);
    } else {
      next = [...cur.filter((x) => x !== "any"), t];
    }
    if (next.length === 0) next = ["any"];
    patch("propertyTypes", next);
  }

  const Heading = compact ? "h2" : "h1";
  const headingClass = compact
    ? "text-xl font-bold mb-1"
    : "text-3xl font-bold mb-1";

  return (
    <div>
      <Heading className={headingClass}>{title}</Heading>
      <p className="text-textMuted text-sm mb-6">{subtitle}</p>

      {showName ? (
        <Field
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      ) : null}

      <WhatWeUnderstood constraints={constraints} />

      <Section title="Markets">
        <p className="text-textMuted text-xs mb-2">
          Scout searches up to five markets and merges results. Edit or add cities.
        </p>
        <div className="flex flex-col gap-3 mb-2">
          {constraints.markets.map((m, i) => (
            <MarketRow
              key={`${i}-${marketKey(m)}`}
              market={m}
              canRemove={constraints.markets.length > 1}
              onChange={(city, state) => updateMarketAt(i, city, state)}
              onRemove={() => removeMarketAt(i)}
            />
          ))}
        </div>
        {constraints.markets.length < 5 ? (
          <button
            type="button"
            onClick={addMarket}
            className="text-xs font-semibold text-primary hover:underline mb-2"
          >
            + Add market
          </button>
        ) : null}
      </Section>

      <Section title="Property type">
        <p className="text-textMuted text-xs mb-2">
          Tap to toggle. Mixed-use and commercial route to RealEstateAPI when
          that key is configured.
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {PROPERTY_TYPE_OPTIONS.map((t) => {
            const active = constraints.propertyTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => togglePropertyType(t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary/15 border-primary/60 text-primary"
                    : "bg-surfaceAlt border-border text-text hover:border-border/80",
                )}
              >
                {PROPERTY_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Property filters">
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Min beds"
            type="number"
            value={String(constraints.bedsMin ?? "")}
            onChange={(e) =>
              patch("bedsMin", e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <Field
            label="Min baths"
            type="number"
            inputMode="decimal"
            value={String(constraints.bathsMin ?? "")}
            onChange={(e) =>
              patch("bathsMin", e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <Field
            label="Min sqft"
            type="number"
            value={String(constraints.sqftMin ?? "")}
            onChange={(e) =>
              patch("sqftMin", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Max beds"
            type="number"
            value={String(constraints.bedsMax ?? "")}
            onChange={(e) =>
              patch("bedsMax", e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <Field
            label="Max baths"
            type="number"
            inputMode="decimal"
            value={String(constraints.bathsMax ?? "")}
            onChange={(e) =>
              patch("bathsMax", e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <Field
            label="Max sqft"
            type="number"
            value={String(constraints.sqftMax ?? "")}
            onChange={(e) =>
              patch("sqftMax", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min lot size (acres)"
            type="number"
            inputMode="decimal"
            value={
              constraints.lotSizeMinSqft
                ? String(
                    Math.round((constraints.lotSizeMinSqft / 43_560) * 100) / 100,
                  )
                : ""
            }
            onChange={(e) =>
              patch(
                "lotSizeMinSqft",
                e.target.value
                  ? Math.round(Number(e.target.value) * 43_560)
                  : undefined,
              )
            }
            hint="Mostly for land searches"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min price ($)"
            type="number"
            value={String(constraints.priceMin ?? "")}
            onChange={(e) =>
              patch("priceMin", e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <Field
            label="Max price ($)"
            type="number"
            value={String(constraints.priceMax ?? "")}
            onChange={(e) =>
              patch("priceMax", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min year built"
            type="number"
            value={String(constraints.yearBuiltMin ?? "")}
            onChange={(e) =>
              patch(
                "yearBuiltMin",
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            hint="Skip pre-war stock, etc."
          />
          <div>
            <label className="text-textMuted text-xs">Max days on market</label>
            <select
              value={constraints.daysOnMarketMax ?? ""}
              onChange={(e) =>
                patch(
                  "daysOnMarketMax",
                  (e.target.value || undefined) as
                    | ProjectConstraints["daysOnMarketMax"]
                    | undefined,
                )
              }
              className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="14d">14 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="6m">6 months</option>
              <option value="12m">12 months</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Max HOA ($/mo)"
            type="number"
            value={String(constraints.hoaMax ?? "")}
            onChange={(e) =>
              patch("hoaMax", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
      </Section>

      <Section title="Capital">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Down payment ($)"
            type="number"
            value={String(constraints.downPayment ?? "")}
            onChange={(e) =>
              patch(
                "downPayment",
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
          />
          <Field
            label="Total cash ($)"
            type="number"
            value={String(constraints.totalCash ?? "")}
            onChange={(e) =>
              patch("totalCash", e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
      </Section>

      <Section title="Mortgage">
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Rate APR (%)"
            type="number"
            inputMode="decimal"
            value={(constraints.mortgage.rateAPR * 100).toFixed(2)}
            onChange={(e) =>
              patchMortgage(
                "rateAPR",
                e.target.value ? Number(e.target.value) / 100 : 0.075,
              )
            }
          />
          <Field
            label="Term (years)"
            type="number"
            value={String(constraints.mortgage.termYears)}
            onChange={(e) =>
              patchMortgage(
                "termYears",
                e.target.value ? Number(e.target.value) : 30,
              )
            }
          />
          <Field
            label="LTV"
            type="number"
            inputMode="decimal"
            value={constraints.mortgage.ltv.toFixed(2)}
            onChange={(e) =>
              patchMortgage("ltv", e.target.value ? Number(e.target.value) : 0.75)
            }
          />
        </div>
        <div className="mb-3">
          <label className="text-textMuted text-xs">Interest only</label>
          <button
            type="button"
            onClick={() =>
              patchMortgage("interestOnly", !constraints.mortgage.interestOnly)
            }
            className={cn(
              "mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
              constraints.mortgage.interestOnly
                ? "bg-primary/15 border-primary/60 text-primary"
                : "bg-surfaceAlt border-border text-text hover:border-border/80",
            )}
          >
            {constraints.mortgage.interestOnly ? "Interest only" : "Amortizing"}
          </button>
        </div>
      </Section>

      <Section title="Goals">
        <Field
          label="Target monthly cashflow ($)"
          type="number"
          value={String(constraints.targetMonthlyCashflow ?? "")}
          onChange={(e) =>
            patch(
              "targetMonthlyCashflow",
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
        />
        <Field
          label="Min DSCR"
          type="number"
          inputMode="decimal"
          value={constraints.minDSCR.toFixed(2)}
          onChange={(e) =>
            patch("minDSCR", e.target.value ? Number(e.target.value) : 1.0)
          }
          hint="1.00 = breakeven, 1.25 = best DSCR-loan rates"
        />
        <div className="flex gap-2 mb-3">
          {[
            { l: "No-ratio (1.00)", v: 1.0 },
            { l: "Min (1.10)", v: 1.1 },
            { l: "Best rates (1.25)", v: 1.25 },
          ].map((p) => {
            const active = Math.abs(constraints.minDSCR - p.v) < 0.001;
            return (
              <button
                key={p.v}
                type="button"
                onClick={() => patch("minDSCR", p.v)}
                className={cn(
                  "flex-1 rounded-full border px-2 py-2 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary/15 border-primary/60 text-primary"
                    : "bg-surfaceAlt border-border text-text hover:border-border/80",
                )}
              >
                {p.l}
              </button>
            );
          })}
        </div>
        <Field
          label="Strategy"
          value={constraints.strategy}
          onChange={(e) =>
            patch(
              "strategy",
              e.target.value.toUpperCase() === "STR" ? "STR" : "LTR",
            )
          }
          hint="LTR = long-term rental, STR = Airbnb / short-term (near-term underwriting)"
        />
        <Field
          label="Notes"
          value={constraints.notes ?? ""}
          onChange={(e) =>
            patch("notes", e.target.value.trim() ? e.target.value : undefined)
          }
          hint="Extra context passed to ranking (amenities, vibe, non-filter desires)"
        />
      </Section>

      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-4">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}

      {showFooter && onBack && onSave ? (
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button onClick={onSave} loading={saving} className="flex-1">
            {saveLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function marketKey(m: Market): string {
  if (m.kind === "city") return `city:${m.city},${m.state}`;
  if (m.kind === "zip") return `zip:${m.zip}`;
  if (m.kind === "county") return `county:${m.county},${m.state}`;
  if (m.kind === "state") return `state:${m.state}`;
  if (m.kind === "near") return `near:${m.place}`;
  return "poly";
}

function MarketRow({
  market,
  canRemove,
  onChange,
  onRemove,
}: {
  market: Market;
  canRemove: boolean;
  onChange: (city: string, state: string) => void;
  onRemove: () => void;
}) {
  const city =
    market.kind === "city"
      ? market.city
      : market.kind === "near"
        ? market.place
        : market.kind === "zip"
          ? market.zip
          : market.kind === "county"
            ? market.county
            : "";
  const state =
    market.kind === "city" ||
    market.kind === "county" ||
    market.kind === "state" ||
    market.kind === "near"
      ? (market.state ?? "")
      : "";

  return (
    <div className="grid grid-cols-[1fr_72px_auto] gap-2 items-end">
      <Field
        label={
          market.kind === "zip"
            ? "ZIP"
            : market.kind === "near"
              ? "Near / place"
              : market.kind === "county"
                ? "County"
                : "City"
        }
        placeholder="Austin"
        value={city}
        onChange={(e) => onChange(e.target.value, state || "CA")}
        hint={
          market.kind === "state" || (!city && state)
            ? "Blank city = statewide"
            : undefined
        }
      />
      <Field
        label="State"
        placeholder="TX"
        value={state}
        onChange={(e) => onChange(city, e.target.value)}
      />
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="mb-1 text-xs text-textMuted hover:text-danger px-2 py-2"
          aria-label="Remove market"
        >
          ✕
        </button>
      ) : (
        <span className="w-8" />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <h2 className="text-text text-base font-semibold mt-2 mb-2">{title}</h2>
      {children}
    </div>
  );
}
