import { z } from "zod";

/**
 * Photos per vision API call. Kept small so each Vercel invocation
 * finishes inside maxDuration; the client continues until the full
 * gallery is covered. Not an Anthropic hard limit.
 */
export const CONDITION_PHOTO_BATCH_SIZE = 10;

/** @deprecated Use CONDITION_PHOTO_BATCH_SIZE — alias for older imports/tests. */
export const MAX_CONDITION_PHOTOS = CONDITION_PHOTO_BATCH_SIZE;

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
  /** When set, photos are one batch of a larger gallery. */
  batch?: {
    globalStartIndex: number;
    totalPhotos: number;
    batchIndex: number;
    batchCount: number;
  };
}

/**
 * Prefer smaller CDN variants so Anthropic spends less time fetching.
 * Zillow commonly uses `-cc_ft_1536` / `-cc_ft_960` size tokens.
 */
export function downscaleListingPhotoUrl(url: string): string {
  return url
    .replace(/-cc_ft_\d+/i, "-cc_ft_768")
    .replace(/-p_f\./i, "-p_c.")
    .replace(/-uncapped\./i, "-cc_ft_768.");
}

/**
 * Deduplicate + downscale the full gallery (no batch cap).
 */
export function normalizeConditionPhotoUrls(photoUrls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of photoUrls) {
    if (typeof raw !== "string") continue;
    const url = downscaleListingPhotoUrl(raw.trim());
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * First `max` normalized URLs — used for single-shot / test helpers.
 * Production multi-batch flow uses {@link normalizeConditionPhotoUrls} + slices.
 */
export function selectConditionPhotoUrls(
  photoUrls: string[],
  max: number = CONDITION_PHOTO_BATCH_SIZE,
): string[] {
  return normalizeConditionPhotoUrls(photoUrls).slice(0, max);
}

export function sliceConditionPhotoBatch(
  allUrls: string[],
  cursor: number,
  batchSize: number = CONDITION_PHOTO_BATCH_SIZE,
): { batch: string[]; nextCursor: number; done: boolean } {
  const start = Math.max(0, Math.min(cursor, allUrls.length));
  const batch = allUrls.slice(start, start + batchSize);
  const nextCursor = start + batch.length;
  return {
    batch,
    nextCursor,
    done: nextCursor >= allUrls.length,
  };
}

const OVERALL_RANK: Record<ConditionOverall, number> = {
  turnkey: 0,
  light_cosmetic: 1,
  moderate_rehab: 2,
  heavy_rehab: 3,
  unknown: 1,
};

export function worseConditionOverall(
  a: ConditionOverall,
  b: ConditionOverall,
): ConditionOverall {
  return OVERALL_RANK[a] >= OVERALL_RANK[b] ? a : b;
}

/** Higher = more serious (red flags first). */
const SEVERITY_RANK: Record<ConditionSeverity, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  cosmetic: 1,
};

const COST_BUCKET_RANK: Record<ConditionCostBucket, number> = {
  rehab: 2,
  maintenance: 1,
  none: 0,
};

/**
 * Order findings by gravity: critical/major red flags first, then
 * rehab over maintenance, then higher estimated mid cost.
 */
export function sortFindingsByGravity(
  findings: ConditionFinding[],
): ConditionFinding[] {
  return [...findings].sort((a, b) => {
    const sev =
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sev !== 0) return sev;
    const bucket =
      (COST_BUCKET_RANK[b.costBucket] ?? 0) -
      (COST_BUCKET_RANK[a.costBucket] ?? 0);
    if (bucket !== 0) return bucket;
    const mid = (f: ConditionFinding) => {
      const lo = f.estimatedCostLow ?? 0;
      const hi = f.estimatedCostHigh ?? lo;
      return (lo + hi) / 2;
    };
    return mid(b) - mid(a);
  });
}

/**
 * Remap a batch assessment onto the global gallery index space and
 * merge with prior findings.
 */
export function mergeConditionBatch(args: {
  priorFindings: ConditionFinding[];
  batch: PropertyConditionAssessment;
  globalStartIndex: number;
  priorOverall?: ConditionOverall | null;
  priorMaintenanceMonthly?: number | null;
}): {
  findings: ConditionFinding[];
  overall: ConditionOverall;
  maintenanceMonthlySuggested: number;
} {
  const remapped = args.batch.findings.map((f, i) => ({
    ...f,
    id: `b${args.globalStartIndex}-${f.id || i}`,
    photoIndexes: (f.photoIndexes ?? []).map(
      (idx) => idx + args.globalStartIndex,
    ),
  }));

  const findings = sortFindingsByGravity(
    [...args.priorFindings, ...remapped].slice(0, 100),
  );
  const priorOverall = args.priorOverall ?? "unknown";
  const overall = worseConditionOverall(priorOverall, args.batch.overall);
  const maintenanceMonthlySuggested = Math.max(
    args.priorMaintenanceMonthly ?? 0,
    args.batch.maintenanceMonthlySuggested,
  );

  return { findings, overall, maintenanceMonthlySuggested };
}

/**
 * Roll up dollar totals from merged findings (+ fallback maintenance).
 */
export function aggregateConditionTotals(
  findings: ConditionFinding[],
  maintenanceMonthlySuggested: number,
): Pick<
  PropertyConditionAssessment,
  "rehabLow" | "rehabHigh" | "rehabSuggested" | "maintenanceMonthlySuggested"
> {
  let rehabLow = 0;
  let rehabHigh = 0;
  let rehabSuggested = 0;
  let rehabCount = 0;

  for (const f of findings) {
    if (f.costBucket !== "rehab") continue;
    const lo = f.estimatedCostLow ?? f.estimatedCostHigh ?? 0;
    const hi = f.estimatedCostHigh ?? f.estimatedCostLow ?? 0;
    if (lo <= 0 && hi <= 0) continue;
    rehabLow += lo;
    rehabHigh += Math.max(lo, hi);
    rehabSuggested += Math.round((lo + Math.max(lo, hi)) / 2);
    rehabCount += 1;
  }

  if (rehabCount === 0) {
    rehabLow = 0;
    rehabHigh = 0;
    rehabSuggested = 0;
  }

  if (rehabLow > rehabHigh) [rehabLow, rehabHigh] = [rehabHigh, rehabLow];
  rehabSuggested = Math.min(
    rehabHigh,
    Math.max(rehabLow, rehabSuggested),
  );

  return {
    rehabLow: Math.round(rehabLow),
    rehabHigh: Math.round(rehabHigh),
    rehabSuggested: Math.round(rehabSuggested),
    maintenanceMonthlySuggested: Math.max(
      100,
      Math.round(maintenanceMonthlySuggested || 100),
    ),
  };
}

export function buildConditionSummary(args: {
  overall: ConditionOverall;
  findings: ConditionFinding[];
  photosAnalyzed: number;
  photosTotal: number;
  complete: boolean;
}): string {
  const n = args.findings.length;
  if (!args.complete) {
    return `Analyzing listing photos… ${args.photosAnalyzed} of ${args.photosTotal} reviewed so far (${n} finding${n === 1 ? "" : "s"}).`;
  }
  if (n === 0) {
    return `Reviewed all ${args.photosTotal} listing photos. No clear condition issues were visible.`;
  }
  return `Reviewed all ${args.photosTotal} listing photos. Found ${n} notable item${n === 1 ? "" : "s"} — overall: ${args.overall.replace(/_/g, " ")}.`;
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
