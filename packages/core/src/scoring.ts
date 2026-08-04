/**
 * Component-based "best property" base score used by the scout before the
 * LLM re-rank. Three buckets summing to a 0–100 score:
 *
 *   - finance (≈60): DSCR / cashflow-vs-target / cash-on-cash. This is the
 *     gatekeeper bucket — a deal that doesn't pencil can't badge its way up.
 *   - opportunity (≈25): recent price cuts and listing freshness. Staleness
 *     is deliberately neutral: an old listing gets no freshness bonus but
 *     never a penalty.
 *   - asset (≈15): size vs. the current scout batch's peers, HOA burden,
 *     rich media as a weak marketing-quality proxy.
 *
 * The per-bucket breakdown is persisted to `deal_scores.score_components`
 * so the UI can explain *why* a deal ranked where it did.
 */

const DAY_MS = 86_400_000;

export interface ScoreSignals {
  /** Effective acquisition price (list price or AVM). Required to express
   *  the price cut as a percentage. */
  price?: number;
  /** Most recent price change in USD; negative = cut. */
  priceChange?: number;
  /** ISO timestamp of the most recent price change. */
  priceChangedAt?: string;
  /** Days the listing has been on market (Zillow's daysOnZillow). */
  daysOnMarket?: number;
  /** Interior square footage. */
  sqft?: number;
  /** Lot size in sqft — used as the size signal when interior sqft is
   *  missing (land / lots). */
  lotSizeSqft?: number;
  /** Monthly HOA. `0` = confirmed none, `undefined` = unknown (neutral). */
  hoaMonthly?: number;
  photoCount?: number;
  hasVirtualTour?: boolean;
}

export interface BatchContext {
  /** Median interior sqft across this scout batch's candidates. */
  medianSqft?: number;
  /** 75th-percentile interior sqft across the batch. */
  topQuartileSqft?: number;
  /** Median lot size (sqft) — fallback comparison for land. */
  medianLotSqft?: number;
  /** 75th-percentile lot size (sqft). */
  topQuartileLotSqft?: number;
  /** Median price per lot-sqft across the batch — the land value metric. */
  medianPricePerLotSqft?: number;
  /** 25th-percentile price per lot-sqft (the cheap end of the batch). */
  bottomQuartilePricePerLotSqft?: number;
}

export interface ScoreComponents {
  finance: number;
  opportunity: number;
  asset: number;
}

export interface BaseScoreResult {
  /** Clamped 0–100 total. */
  score: number;
  components: ScoreComponents;
}

export interface BaseScoreArgs {
  dscr: number;
  monthlyCashflow: number;
  /** User's monthly cashflow goal; 0/absent = no target set. */
  targetCashflow: number;
  cashOnCash: number;
  /**
   * "rental" (default) scores the finance bucket on DSCR/cashflow.
   * "land" swaps it for price-per-lot-sqft vs. the batch — vacant land has
   * no rent, so DSCR tiers would unfairly floor every parcel.
   */
  assetClass?: "rental" | "land";
  signals?: ScoreSignals;
  batch?: BatchContext;
  /** Injectable clock for tests (defaults to Date.now()). */
  now?: number;
}

/**
 * Finance bucket, 0–60. Same shape as the original purely-financial score
 * (DSCR tiers, cashflow vs. target, CoC nudges) rescaled into 60 points.
 */
export function scoreFinance(args: {
  dscr: number;
  monthlyCashflow: number;
  targetCashflow: number;
  cashOnCash: number;
}): number {
  let s = 30;
  if (args.dscr >= 1.25) s += 20;
  else if (args.dscr >= 1.1) s += 12;
  else if (args.dscr >= 1.0) s += 4;
  else s -= 25;

  if (args.targetCashflow > 0) {
    if (args.monthlyCashflow >= args.targetCashflow) s += 12;
    else if (args.monthlyCashflow >= args.targetCashflow * 0.75) s += 3;
    else s -= 10;
  }

  if (args.cashOnCash >= 0.1) s += 4;
  if (args.cashOnCash < 0) s -= 8;

  return clamp(s, 0, 60);
}

/**
 * Land finance bucket, 0–60. Vacant land earns no rent, so "finance" here
 * means acquisition value: price per lot-sqft compared to the rest of the
 * scout batch. Cheaper-than-peers dirt scores up; missing data stays at a
 * neutral 30 so opportunity/asset signals still differentiate.
 */
export function scoreLandFinance(
  signals: ScoreSignals | undefined,
  batch: BatchContext | undefined,
): number {
  let s = 30;
  const price = positiveOrUndefined(signals?.price);
  const lot = positiveOrUndefined(signals?.lotSizeSqft);
  if (price !== undefined && lot !== undefined && batch?.medianPricePerLotSqft) {
    const ppsf = price / lot;
    if (
      batch.bottomQuartilePricePerLotSqft &&
      ppsf <= batch.bottomQuartilePricePerLotSqft
    ) {
      s += 25;
    } else if (ppsf < batch.medianPricePerLotSqft) {
      s += 12;
    }
  }
  return clamp(s, 0, 60);
}

/**
 * Opportunity bucket, 0–25. Rewards recent price cuts (scaled by % of
 * price), cuts made in the last 14 days, and fresh listings. No stale
 * penalty by design.
 */
export function scoreOpportunity(
  signals: ScoreSignals | undefined,
  now: number = Date.now(),
): number {
  if (!signals) return 0;
  let s = 0;

  const { price, priceChange, priceChangedAt, daysOnMarket } = signals;
  const isCut =
    typeof priceChange === "number" && isFinite(priceChange) && priceChange < 0;
  if (isCut) {
    const cutPct =
      price && price > 0 ? Math.abs(priceChange) / price : undefined;
    if (cutPct !== undefined && cutPct >= 0.05) s += 12;
    else if (cutPct !== undefined && cutPct >= 0.02) s += 7;
    else s += 3;

    if (priceChangedAt) {
      const ts = Date.parse(priceChangedAt);
      if (isFinite(ts) && now - ts <= 14 * DAY_MS && now - ts >= 0) s += 4;
    }
  }

  if (typeof daysOnMarket === "number" && isFinite(daysOnMarket)) {
    if (daysOnMarket <= 7) s += 9;
    else if (daysOnMarket <= 30) s += 5;
    else if (daysOnMarket <= 90) s += 2;
    // > 90 days: neutral, never negative.
  }

  return clamp(s, 0, 25);
}

/**
 * Asset bucket, −5–15. Size vs. this batch's peers (interior sqft, or lot
 * size when interior sqft is missing — the land case), HOA burden, and a
 * small rich-media bonus.
 */
export function scoreAsset(
  signals: ScoreSignals | undefined,
  batch: BatchContext | undefined,
): number {
  if (!signals) return 0;
  let s = 0;

  const sqft = positiveOrUndefined(signals.sqft);
  const lot = positiveOrUndefined(signals.lotSizeSqft);
  if (sqft !== undefined && batch?.medianSqft) {
    if (batch.topQuartileSqft && sqft >= batch.topQuartileSqft) s += 8;
    else if (sqft > batch.medianSqft) s += 5;
  } else if (sqft === undefined && lot !== undefined && batch?.medianLotSqft) {
    if (batch.topQuartileLotSqft && lot >= batch.topQuartileLotSqft) s += 8;
    else if (lot > batch.medianLotSqft) s += 5;
  }

  if (signals.hoaMonthly !== undefined) {
    if (signals.hoaMonthly === 0) s += 5;
    else if (signals.hoaMonthly > 150) s -= 5;
  }

  const richMedia =
    (signals.photoCount ?? 0) >= 10 || signals.hasVirtualTour === true;
  if (richMedia) s += 2;

  return clamp(s, -5, 15);
}

export function computeBaseScore(args: BaseScoreArgs): BaseScoreResult {
  const now = args.now ?? Date.now();
  const components: ScoreComponents = {
    finance:
      args.assetClass === "land"
        ? scoreLandFinance(args.signals, args.batch)
        : scoreFinance(args),
    opportunity: scoreOpportunity(args.signals, now),
    asset: scoreAsset(args.signals, args.batch),
  };
  const score = clamp(
    Math.round(components.finance + components.opportunity + components.asset),
    0,
    100,
  );
  return { score, components };
}

/**
 * Batch percentile context for the asset bucket, computed once per scout
 * run over the candidate pool (before financial filtering, so the "peers"
 * are everything the market offered, not just survivors).
 */
export function computeBatchContext(
  candidates: Array<{ sqft?: number; lotSizeSqft?: number; price?: number }>,
): BatchContext {
  const sqfts = candidates
    .map((c) => positiveOrUndefined(c.sqft))
    .filter((v): v is number => v !== undefined);
  const lots = candidates
    .map((c) => positiveOrUndefined(c.lotSizeSqft))
    .filter((v): v is number => v !== undefined);
  const pricesPerLotSqft = candidates
    .map((c) => {
      const price = positiveOrUndefined(c.price);
      const lot = positiveOrUndefined(c.lotSizeSqft);
      return price !== undefined && lot !== undefined ? price / lot : undefined;
    })
    .filter((v): v is number => v !== undefined);
  return {
    medianSqft: percentile(sqfts, 0.5),
    topQuartileSqft: percentile(sqfts, 0.75),
    medianLotSqft: percentile(lots, 0.5),
    topQuartileLotSqft: percentile(lots, 0.75),
    medianPricePerLotSqft: percentile(pricesPerLotSqft, 0.5),
    bottomQuartilePricePerLotSqft: percentile(pricesPerLotSqft, 0.25),
  };
}

function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  // lo/hi are always within [0, length-1] since idx is.
  const vLo = sorted[lo]!;
  const vHi = sorted[hi]!;
  if (lo === hi) return vLo;
  return vLo + (vHi - vLo) * (idx - lo);
}

function positiveOrUndefined(v: number | undefined): number | undefined {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : undefined;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
