"use client";

import {
  PROPERTY_TYPE_LABELS,
  ProjectConstraintsSchema,
  type ProjectConstraints,
  type PropertyType,
} from "@papuc/core";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { formatMarket } from "@/lib/format";
import { createProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";
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

const SAMPLE_PROMPTS = [
  "I have $200k down and want $600/month cashflow on single family homes in Austin, TX.",
  "I have $40k in down payments and want to rent a place out for $2,500/month in Phoenix, AZ.",
  "Looking for an Airbnb in Berkeley, CA under $1.1M with 4 beds.",
];

type Step = "prompt" | "review";

async function parseProjectPrompt(prompt: string): Promise<ProjectConstraints> {
  const res = await fetch("/api/projects/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `parse failed (${res.status})`);
  }
  const json = (await res.json()) as { constraints: unknown };
  return ProjectConstraintsSchema.parse(json.constraints);
}

export function NewProjectForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<Step>("prompt");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [constraints, setConstraints] = useState<ProjectConstraints | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!prompt.trim()) return;
    setError(null);
    setParsing(true);
    try {
      const c = await parseProjectPrompt(prompt);
      setConstraints(c);
      setName(`${c.strategy} in ${formatMarket(c.markets[0])}`);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!constraints) return;
    setError(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const row = await createProject(supabase, {
        name: name.trim() || "Untitled project",
        rawPrompt: prompt,
        constraints,
      });
      router.push(`/projects/${row.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (step === "prompt") {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-1">New project</h1>
        <p className="text-textMuted text-sm mb-6">
          Describe in plain English what you're looking for. The agent will pull
          out constraints (market, price, beds, cashflow, DSCR target).
        </p>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., I have $40k for a down payment and want to rent out a single family home for $2,500/month in Phoenix, AZ."
          className="min-h-32 mb-4"
        />

        <p className="text-textMuted text-xs mb-2">Try one of these:</p>
        <div className="flex flex-col gap-2 mb-6">
          {SAMPLE_PROMPTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="text-left bg-surface border border-border rounded-2xl p-3 text-sm hover:border-border/80 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-4">
            <p className="text-danger text-xs">{error}</p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={parse}
            loading={parsing}
            disabled={!prompt.trim()}
            className="flex-1"
          >
            Parse goals
          </Button>
        </div>
      </div>
    );
  }

  if (!constraints) return null;

  return (
    <ConstraintReview
      name={name}
      setName={setName}
      constraints={constraints}
      setConstraints={setConstraints}
      onBack={() => setStep("prompt")}
      onSave={save}
      saving={saving}
      error={error}
    />
  );
}

function ConstraintReview({
  name,
  setName,
  constraints,
  setConstraints,
  onBack,
  onSave,
  saving,
  error,
}: {
  name: string;
  setName: (v: string) => void;
  constraints: ProjectConstraints;
  setConstraints: (c: ProjectConstraints) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const market = constraints.markets[0];
  const cityState =
    market?.kind === "city"
      ? { city: market.city, state: market.state }
      : market?.kind === "county"
        ? { city: "", state: market.state }
        : { city: "", state: "" };

  function setMarketCity(city: string) {
    setConstraints({
      ...constraints,
      markets: [{ kind: "city", city, state: cityState.state || "" }],
    });
  }
  function setMarketState(state: string) {
    setConstraints({
      ...constraints,
      markets: [
        { kind: "city", city: cityState.city || "", state: state.toUpperCase() },
      ],
    });
  }
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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">Review constraints</h1>
      <p className="text-textMuted text-sm mb-6">
        The agent extracted these. Tweak anything before saving.
      </p>

      <Field
        label="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <Section title="Market">
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="City"
            placeholder="Austin"
            value={cityState.city ?? ""}
            onChange={(e) => setMarketCity(e.target.value)}
            className="col-span-2"
          />
          <Field
            label="State"
            placeholder="TX"
            value={cityState.state ?? ""}
            onChange={(e) => setMarketState(e.target.value)}
          />
        </div>
      </Section>

      <Section title="Property type">
        <p className="text-textMuted text-xs mb-2">
          Tap to toggle. The agent guessed from your prompt — adjust as
          needed. Mixed-use and commercial are only available on the
          RealEstateAPI provider.
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
          hint="LTR = long-term rental, STR = Airbnb / short-term"
        />
      </Section>

      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-4">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}

      <div className="flex gap-2 mt-4">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button onClick={onSave} loading={saving} className="flex-1">
          Save project
        </Button>
      </div>
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
