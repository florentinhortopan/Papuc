import { z } from "zod";

/** Max listing photos sent to the vision model (cost / latency cap). */
export const MAX_CONDITION_PHOTOS = 24;

export const CONDITION_DISCLAIMER =
  "Based on listing photos only — marketing shots can hide defects. Not a home inspection; verify on site before underwriting.";

export const ConditionSeveritySchema = z.enum([
  "critical",
  "major",
  "minor",
  "cosmetic",
]);
export type ConditionSeverity = z.infer<typeof ConditionSeveritySchema>;

export const ConditionCostBucketSchema = z.enum([
  "rehab",
  "maintenance",
  "none",
]);
export type ConditionCostBucket = z.infer<typeof ConditionCostBucketSchema>;

export const ConditionConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ConditionConfidence = z.infer<typeof ConditionConfidenceSchema>;

export const ConditionOverallSchema = z.enum([
  "turnkey",
  "light_cosmetic",
  "moderate_rehab",
  "heavy_rehab",
  "unknown",
]);
export type ConditionOverall = z.infer<typeof ConditionOverallSchema>;

export const ConditionFindingSchema = z.object({
  id: z.string().min(1),
  severity: ConditionSeveritySchema,
  category: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
  photoIndexes: z.array(z.number().int().nonnegative()).default([]),
  estimatedCostLow: z.number().nonnegative().optional(),
  estimatedCostHigh: z.number().nonnegative().optional(),
  costBucket: ConditionCostBucketSchema,
  confidence: ConditionConfidenceSchema,
});
export type ConditionFinding = z.infer<typeof ConditionFindingSchema>;

export const PropertyConditionAssessmentSchema = z.object({
  overall: ConditionOverallSchema,
  summary: z.string().min(1),
  findings: z.array(ConditionFindingSchema).default([]),
  rehabLow: z.number().nonnegative(),
  rehabHigh: z.number().nonnegative(),
  rehabSuggested: z.number().nonnegative(),
  maintenanceMonthlySuggested: z.number().nonnegative(),
  disclaimer: z.string().optional(),
});
export type PropertyConditionAssessment = z.infer<
  typeof PropertyConditionAssessmentSchema
>;

export interface AnalyzePropertyConditionArgs {
  photoUrls: string[];
  address?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  price?: number;
}

/**
 * Deduplicate and cap photo URLs for vision analysis. Always keeps the
 * first URL (cover) when present, then fills up to `max` unique https URLs.
 */
export function selectConditionPhotoUrls(
  photoUrls: string[],
  max: number = MAX_CONDITION_PHOTOS,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of photoUrls) {
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Defensive normalization of the vision tool output so junk ranges,
 * unknown enums, and inverted low/high never reach the UI.
 */
export function normalizePropertyConditionAssessment(
  raw: unknown,
): PropertyConditionAssessment {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const overalls = ConditionOverallSchema.options;
  const overall = overalls.includes(r.overall)
    ? (r.overall as ConditionOverall)
    : "unknown";

  const money = (v: unknown): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
    // Cap absurd LLM hallucinations ($50M rehab on a listing photo).
    if (v > 5_000_000) return 5_000_000;
    return Math.round(v);
  };

  let rehabLow = money(r.rehabLow) ?? 0;
  let rehabHigh = money(r.rehabHigh) ?? rehabLow;
  if (rehabLow > rehabHigh) [rehabLow, rehabHigh] = [rehabHigh, rehabLow];

  let rehabSuggested = money(r.rehabSuggested);
  if (rehabSuggested === undefined) {
    rehabSuggested = Math.round((rehabLow + rehabHigh) / 2);
  }
  rehabSuggested = Math.min(rehabHigh, Math.max(rehabLow, rehabSuggested));

  let maintenanceMonthlySuggested =
    money(r.maintenanceMonthlySuggested) ?? 100;
  if (maintenanceMonthlySuggested > 50_000) {
    maintenanceMonthlySuggested = 50_000;
  }

  const severities = ConditionSeveritySchema.options;
  const buckets = ConditionCostBucketSchema.options;
  const confidences = ConditionConfidenceSchema.options;

  const findings: ConditionFinding[] = Array.isArray(r.findings)
    ? r.findings
        .map((f: any, i: number): ConditionFinding | null => {
          if (!f || typeof f !== "object") return null;
          const title =
            typeof f.title === "string" && f.title.trim()
              ? f.title.trim()
              : null;
          const detail =
            typeof f.detail === "string" && f.detail.trim()
              ? f.detail.trim()
              : title;
          if (!title || !detail) return null;
          const category =
            typeof f.category === "string" && f.category.trim()
              ? f.category.trim()
              : "general";
          const severity = severities.includes(f.severity)
            ? f.severity
            : "minor";
          const costBucket = buckets.includes(f.costBucket)
            ? f.costBucket
            : "none";
          const confidence = confidences.includes(f.confidence)
            ? f.confidence
            : "low";
          let estimatedCostLow = money(f.estimatedCostLow);
          let estimatedCostHigh = money(f.estimatedCostHigh);
          if (
            estimatedCostLow !== undefined &&
            estimatedCostHigh !== undefined &&
            estimatedCostLow > estimatedCostHigh
          ) {
            [estimatedCostLow, estimatedCostHigh] = [
              estimatedCostHigh,
              estimatedCostLow,
            ];
          }
          const photoIndexes = Array.isArray(f.photoIndexes)
            ? f.photoIndexes
                .filter(
                  (n: unknown) =>
                    typeof n === "number" &&
                    Number.isFinite(n) &&
                    n >= 0 &&
                    Number.isInteger(n),
                )
                .slice(0, 12)
            : [];
          return {
            id:
              typeof f.id === "string" && f.id.trim()
                ? f.id.trim()
                : `finding-${i + 1}`,
            severity,
            category,
            title,
            detail,
            photoIndexes,
            estimatedCostLow,
            estimatedCostHigh,
            costBucket,
            confidence,
          };
        })
        .filter((f: ConditionFinding | null): f is ConditionFinding => f != null)
        .slice(0, 40)
    : [];

  const summary =
    typeof r.summary === "string" && r.summary.trim()
      ? r.summary.trim()
      : findings.length
        ? `Photo review found ${findings.length} notable item(s).`
        : "No clear condition issues were visible in the listing photos.";

  return PropertyConditionAssessmentSchema.parse({
    overall,
    summary,
    findings,
    rehabLow,
    rehabHigh,
    rehabSuggested,
    maintenanceMonthlySuggested,
    disclaimer:
      typeof r.disclaimer === "string" && r.disclaimer.trim()
        ? r.disclaimer.trim()
        : CONDITION_DISCLAIMER,
  });
}
