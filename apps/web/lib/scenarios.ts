import { createClient } from "@/lib/supabase/client";

import type { ScenariosRow } from "./database.types";

/**
 * Snapshot of every field on the deal-detail page that the user can edit
 * via inputs, sliders, or the STR matrix. Persisted to `scenarios.inputs`
 * as JSONB so users can save multiple alternatives per deal and reload
 * them in later sessions.
 *
 * Forward compatibility: when a new pro-forma input is added, just append
 * it here as optional. Old scenarios will simply lack the field and the
 * deal-detail loader merges with the live defaults.
 */
export interface ScenarioInputs {
  // Pro-forma input fields (mirrors `ProFormaState` in deal-detail-client).
  price: string;
  downPayment: string;
  improvements: string;
  taxRate: string;
  rateAPR: string;
  termYears: string;
  propertyTaxRatePct: string;
  insuranceAnnual: string;
  hoaMonthly: string;
  pmiOverride: string | null;
  utilitiesMonthly: string;
  maintenanceMonthly: string;
  miscMonthly: string;
  monthlyRentLTR: string;
  strategy: "LTR" | "STR";

  // STR-only matrix; safe to include for LTR (it's ignored).
  strMatrix?: {
    monthlyNights: number[];
    monthlyADR: number[];
    monthlyOccupancy: number[];
    monthlyAvgStays: number[];
  };
}

export type ScenarioRow = ScenariosRow;

/**
 * List every saved scenario for a deal, newest first.
 *
 * RLS scopes this to the authenticated user's owned scenarios; no extra
 * filter needed beyond `deal_id` because the deal already has to belong
 * to one of the user's projects to be visible.
 */
export async function listScenarios(dealId: string): Promise<ScenarioRow[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("scenarios")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ScenarioRow[];
}

/**
 * Persist a new scenario. We capture `monthly_cashflow_at_save` so the
 * picker can preview each scenario without recomputing the pro-forma.
 */
export async function createScenario(args: {
  dealId: string;
  name: string;
  notes?: string;
  inputs: ScenarioInputs;
  monthlyCashflow: number;
}): Promise<ScenarioRow> {
  const sb = createClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    throw new Error("Not signed in");
  }
  const { data, error } = await sb
    .from("scenarios")
    .insert({
      deal_id: args.dealId,
      owner_id: user.id,
      name: args.name.trim(),
      notes: args.notes?.trim() || null,
      inputs: args.inputs,
      monthly_cashflow_at_save: Math.round(args.monthlyCashflow * 100) / 100,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ScenarioRow;
}

/**
 * Overwrite an existing scenario's inputs (and optionally its name /
 * notes). Useful for an "Update from current" button so users don't
 * accumulate near-duplicate snapshots.
 */
export async function updateScenario(args: {
  id: string;
  name?: string;
  notes?: string;
  inputs?: ScenarioInputs;
  monthlyCashflow?: number;
}): Promise<ScenarioRow> {
  const sb = createClient();
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = args.name.trim();
  if (args.notes !== undefined) patch.notes = args.notes?.trim() || null;
  if (args.inputs !== undefined) patch.inputs = args.inputs;
  if (args.monthlyCashflow !== undefined) {
    patch.monthly_cashflow_at_save =
      Math.round(args.monthlyCashflow * 100) / 100;
  }
  const { data, error } = await sb
    .from("scenarios")
    .update(patch)
    .eq("id", args.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ScenarioRow;
}

export async function deleteScenario(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("scenarios").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Defensive cast of the JSONB column back into our typed contract. We
 * don't validate shape exhaustively (the DB column is opaque); the
 * deal-detail loader merges this with live defaults so missing fields
 * never crash the page.
 */
export function asScenarioInputs(raw: unknown): ScenarioInputs | null {
  if (!raw || typeof raw !== "object") return null;
  // Light shape check on the only field that must exist for the merge.
  const candidate = raw as Partial<ScenarioInputs>;
  if (typeof candidate.price !== "string") return null;
  return candidate as ScenarioInputs;
}
