import {
  computeBaseScore,
  detectPropertyLookupIntent,
  HasDataClient,
  parseListingUrl,
  pickZillowAddressMatch,
  ProjectConstraintsSchema,
  propertyTaxRateForState,
  streetFromZillowUrl,
  type ListingAddressHint,
  type ParsedListingUrl,
  type ProjectConstraints,
  type ZillowPropertyDetail,
} from "@papuc/core";
import {
  addressHintIsUsable,
  ClaudeProvider,
} from "@papuc/core/llm";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createProject,
  getProject,
  listProjects,
  type ProjectRow,
} from "./projects";
import { underwriteDeal, type UnderwritableDeal } from "./underwrite";

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function estimateRentFromPrice(price: number): number {
  return price * 0.007;
}

function isLandHomeType(homeType: string | undefined): boolean {
  if (!homeType) return false;
  return /lot|land|vacant/i.test(homeType);
}

export type ImportListingSuccess = {
  ok: true;
  dealId: string;
  projectId: string;
  alreadyExisted: boolean;
  address: string | null;
  zpid: string | null;
  sourceUrl: string;
  monthlyCashflow: number;
  dscr: number;
  score: number;
};

export type ImportListingFailure = {
  ok: false;
  status: number;
  error: string;
  code?: string;
};

/** Pick an owned project, or create a lightweight "Imports" bucket. */
export async function resolveImportProject(
  sb: SupabaseClient,
  userId: string,
  projectId?: string | null,
): Promise<ProjectRow | ImportListingFailure> {
  const requested = (projectId ?? "").trim();
  if (requested) {
    try {
      const project = await getProject(sb, requested);
      if (project.owner_id !== userId) {
        return { ok: false, status: 403, error: "not your project" };
      }
      return project;
    } catch {
      return { ok: false, status: 404, error: "project not found" };
    }
  }

  const owned = await listProjects(sb);
  if (owned[0]) return owned[0];

  const constraints = ProjectConstraintsSchema.parse({
    markets: [{ kind: "city", city: "Austin", state: "TX" }],
    strategy: "LTR",
    minDSCR: 1.0,
    mortgage: {
      rateAPR: 0.075,
      termYears: 30,
      ltv: 0.75,
      interestOnly: false,
    },
    notes: "Auto-created for one-off listing imports",
    intent: {
      summary: "Imports inbox for pasted addresses and listing links",
      useCase: "rental_income",
    },
  });

  return createProject(sb, {
    name: "Imports",
    rawPrompt: "Auto-created for listing imports",
    constraints,
  });
}

function hintFromFreeTextAddress(address: string): ListingAddressHint {
  const t = address.trim();
  const zip = t.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  const states = [...t.matchAll(/\b([A-Za-z]{2})\b/g)].map((m) =>
    m[1]!.toUpperCase(),
  );
  const US = new Set([
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  ]);
  const state = [...states].reverse().find((s) => US.has(s));
  const street = t.replace(/,.*/, "").trim() || t;
  return {
    street,
    state,
    zip,
    keyword: t,
    source: "slug",
    confidence: zip || state ? "medium" : "low",
  };
}

async function resolveAddressHint(
  parsed: ParsedListingUrl,
): Promise<
  | { ok: true; hint: ListingAddressHint }
  | ImportListingFailure
> {
  if (addressHintIsUsable(parsed.addressHint)) {
    return { ok: true, hint: parsed.addressHint };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 422,
      error:
        "Could not read an address from that URL slug. Paste a clearer property link, or set ANTHROPIC_API_KEY for LLM address extraction.",
      code: "address_unparsed",
    };
  }

  try {
    const claude = new ClaudeProvider({
      apiKey,
      model: process.env.ANTHROPIC_MODEL,
    });
    const hint = await claude.extractListingAddress({
      url: parsed.canonicalUrl,
      platform: parsed.platform,
    });
    if (!addressHintIsUsable(hint)) {
      return {
        ok: false,
        status: 422,
        error:
          "Could not confidently read a street address from that listing URL.",
        code: "address_unparsed",
      };
    }
    return { ok: true, hint };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      error: `Address extraction failed: ${msg}`,
      code: "address_llm_error",
    };
  }
}

async function fetchViaAddressHint(
  client: HasDataClient,
  hint: ListingAddressHint,
  sourceUrl: string,
): Promise<
  | {
      ok: true;
      detail: ZillowPropertyDetail;
      sourceUrl: string;
      zillowUrl: string;
    }
  | ImportListingFailure
> {
  let search;
  try {
    search = await client.searchZillow({
      keyword: hint.keyword,
      type: "forSale",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      error: `Zillow address search failed: ${msg}`,
      code: "provider_error",
    };
  }

  const pick = pickZillowAddressMatch(search.data ?? [], hint);
  if (!pick.ok) {
    return {
      ok: false,
      status: 422,
      error:
        pick.reason === "ambiguous"
          ? `Multiple Zillow matches for "${hint.keyword}" — paste a Zillow homedetails URL instead.`
          : `No Zillow listing matched "${hint.keyword}". Try a fuller address or a listing link.`,
      code: pick.reason === "ambiguous" ? "ambiguous_match" : "no_match",
    };
  }

  const detailUrl =
    pick.hit.detailUrl ||
    (pick.hit.zpid
      ? `https://www.zillow.com/homedetails/${pick.hit.zpid}_zpid/`
      : null);
  if (!detailUrl) {
    return {
      ok: false,
      status: 422,
      error: "Matched Zillow listing had no detail URL.",
      code: "no_detail_url",
    };
  }

  try {
    const detail = await client.getZillowProperty(detailUrl);
    return {
      ok: true,
      detail,
      sourceUrl,
      zillowUrl: detail.url || detailUrl,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      error: `Could not load Zillow detail for matched address: ${msg}`,
      code: "provider_error",
    };
  }
}

async function fetchZillowDetailForImport(
  client: HasDataClient,
  parsed: ParsedListingUrl,
): Promise<
  | {
      ok: true;
      detail: ZillowPropertyDetail;
      sourceUrl: string;
      zillowUrl: string;
    }
  | ImportListingFailure
> {
  if (parsed.platform === "zillow") {
    try {
      const detail = await client.getZillowProperty(parsed.canonicalUrl);
      const zillowUrl = detail.url || parsed.canonicalUrl;
      return {
        ok: true,
        detail,
        sourceUrl: zillowUrl,
        zillowUrl,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 502,
        error: `Could not load that Zillow listing: ${msg}`,
        code: "provider_error",
      };
    }
  }

  const resolved = await resolveAddressHint(parsed);
  if (!resolved.ok) return resolved;
  return fetchViaAddressHint(client, resolved.hint, parsed.canonicalUrl);
}

async function upsertUnderwrittenDeal(
  sb: SupabaseClient,
  project: ProjectRow,
  args: {
    detail: ZillowPropertyDetail;
    sourceUrl: string;
    zillowUrl: string;
    parsedZpid?: string;
    fallbackAddress?: string | null;
    importedFromUrl?: string;
    importedPlatform?: string;
    importedListingId?: string;
  },
): Promise<ImportListingSuccess | ImportListingFailure> {
  const { detail, sourceUrl, zillowUrl } = args;
  const zpid = (detail.zpid || args.parsedZpid || "").trim();
  if (!zpid) {
    return {
      ok: false,
      status: 422,
      error: "Zillow response had no property id (zpid).",
      code: "missing_zpid",
    };
  }

  const address =
    detail.address?.trim() ||
    streetFromZillowUrl(zillowUrl) ||
    args.fallbackAddress ||
    null;
  const price = detail.price ?? null;
  const avm = detail.zestimate ?? null;
  const effectivePrice = price ?? avm;
  if (!effectivePrice || effectivePrice <= 0) {
    return {
      ok: false,
      status: 422,
      error: "Listing has no usable price or Zestimate.",
      code: "no_price",
    };
  }

  const monthlyRent =
    detail.rentZestimate && detail.rentZestimate > 0
      ? detail.rentZestimate
      : estimateRentFromPrice(effectivePrice);

  const isLand = isLandHomeType(detail.homeType);
  const propertyTaxRatePct =
    detail.propertyTaxRatePct ?? propertyTaxRateForState(detail.state);
  const hoaMonthly = detail.hoaMonthly;

  const mlsData = {
    ...(detail.raw && typeof detail.raw === "object" ? detail.raw : {}),
    homeType: detail.homeType,
    ...(args.importedFromUrl
      ? { importedFromUrl: args.importedFromUrl }
      : { importedFromUrl: sourceUrl }),
    ...(args.importedPlatform
      ? { importedPlatform: args.importedPlatform }
      : {}),
    ...(args.importedListingId
      ? { importedListingId: args.importedListingId }
      : {}),
    zillowUrl,
  };

  const dealForUnderwrite: UnderwritableDeal = {
    price,
    est_value: avm,
    est_rent: monthlyRent,
    state: detail.state ?? null,
    hoa_monthly: hoaMonthly ?? null,
    property_tax_rate: propertyTaxRatePct ?? null,
    mls_data: mlsData,
    str_adr: null,
    str_occupancy: null,
    str_monthly_distribution: null,
    str_estimated_at: null,
  };

  const constraints: ProjectConstraints = isLand
    ? { ...project.constraints, strategy: "LTR" }
    : project.constraints;

  const { seeds, result: proforma } = underwriteDeal(
    dealForUnderwrite,
    constraints,
  );
  const monthlyCashflow = proforma.annualPreTaxProfit / 12;
  const targetCashflow = constraints.targetMonthlyCashflow ?? 0;

  const { score: baseScore, components: scoreComponents } = computeBaseScore({
    dscr: proforma.dscr,
    monthlyCashflow,
    targetCashflow,
    cashOnCash: proforma.cashOnCashReturn,
    assetClass: isLand ? "land" : "rental",
    signals: {
      price: seeds.price,
      sqft: detail.sqft,
      hoaMonthly: hoaMonthly ?? undefined,
      photoCount: detail.photos?.length,
    },
  });

  const { data: existing } = await sb
    .from("deals")
    .select("id")
    .eq("project_id", project.id)
    .eq("source", "hasdata")
    .eq("source_property_id", zpid)
    .maybeSingle();

  const alreadyExisted = Boolean(existing?.id);
  const photos = detail.photos?.length ? detail.photos : [];

  const { data: dealRow, error: dealErr } = await sb
    .from("deals")
    .upsert(
      {
        project_id: project.id,
        source: "hasdata",
        source_property_id: zpid,
        address,
        city: detail.city ?? null,
        state: detail.state ?? null,
        zip: detail.zip ?? null,
        lat: detail.lat ?? null,
        lng: detail.lng ?? null,
        price,
        beds: detail.beds ?? null,
        baths: detail.baths ?? null,
        sqft: detail.sqft ?? null,
        photos,
        primary_image_url: photos[0] ?? null,
        source_url: sourceUrl,
        mls_data: mlsData,
        est_value: avm,
        est_rent: monthlyRent,
        hoa_monthly: hoaMonthly ?? null,
        property_tax_rate: propertyTaxRatePct ?? null,
        last_refreshed_at: new Date().toISOString(),
      },
      { onConflict: "project_id,source,source_property_id" },
    )
    .select("id")
    .single();

  if (dealErr || !dealRow) {
    return {
      ok: false,
      status: 500,
      error: dealErr?.message ?? "failed to save deal",
      code: "upsert_failed",
    };
  }

  const { error: scoreErr } = await sb.from("deal_scores").upsert(
    {
      deal_id: dealRow.id,
      project_id: project.id,
      dscr: round(proforma.dscr, 3),
      dscr_lender_haircut: round(proforma.dscrLenderHaircut, 3),
      cash_on_cash: round(proforma.cashOnCashReturn, 4),
      monthly_cashflow: round(monthlyCashflow, 2),
      irr_5yr: proforma.irr5Yr !== null ? round(proforma.irr5Yr, 4) : null,
      payout_years: round(proforma.payoutYears, 2),
      score: Math.round(baseScore),
      score_components: scoreComponents,
      rationale: null,
      computed_proforma: proforma,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "deal_id" },
  );

  if (scoreErr) {
    return {
      ok: false,
      status: 500,
      error: scoreErr.message,
      code: "score_failed",
    };
  }

  return {
    ok: true,
    dealId: dealRow.id as string,
    projectId: project.id,
    alreadyExisted,
    address,
    zpid,
    sourceUrl,
    monthlyCashflow,
    dscr: proforma.dscr,
    score: Math.round(baseScore),
  };
}

/**
 * Import from a listing URL or free-text street address into an owned project
 * (or auto-picked / auto-created Imports project).
 */
export async function importListingFromQuery(
  sb: SupabaseClient,
  args: {
    userId: string;
    query: string;
    projectId?: string | null;
  },
): Promise<ImportListingSuccess | ImportListingFailure> {
  const query = (args.query ?? "").trim();
  if (!query) {
    return { ok: false, status: 400, error: "query is required", code: "empty" };
  }

  const projectOrErr = await resolveImportProject(
    sb,
    args.userId,
    args.projectId,
  );
  if ("ok" in projectOrErr && projectOrErr.ok === false) return projectOrErr;
  const project = projectOrErr as ProjectRow;

  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: "HASDATA_API_KEY not set" };
  }
  const client = new HasDataClient({ apiKey });

  const intent =
    detectPropertyLookupIntent(query) ??
    (parseListingUrl(query).ok
      ? ({ kind: "url" as const, value: query })
      : null);

  // Explicit address path (spoken / typed street address).
  if (intent?.kind === "address") {
    const hint = hintFromFreeTextAddress(intent.value);
    if (!addressHintIsUsable(hint)) {
      return {
        ok: false,
        status: 422,
        error: "Need a fuller street address (include city and state or ZIP).",
        code: "address_unparsed",
      };
    }
    const fetched = await fetchViaAddressHint(client, hint, intent.value);
    if (!fetched.ok) return fetched;
    return upsertUnderwrittenDeal(sb, project, {
      detail: fetched.detail,
      sourceUrl: fetched.sourceUrl,
      zillowUrl: fetched.zillowUrl,
      fallbackAddress: intent.value,
      importedFromUrl: intent.value,
      importedPlatform: "address",
    });
  }

  // URL path (Zillow / Redfin / Realtor / Homes).
  const urlText = intent?.kind === "url" ? intent.value : query;
  const parsed = parseListingUrl(urlText);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: parsed.message,
      code: parsed.code,
    };
  }

  const fetched = await fetchZillowDetailForImport(client, parsed);
  if (!fetched.ok) return fetched;

  return upsertUnderwrittenDeal(sb, project, {
    detail: fetched.detail,
    sourceUrl: fetched.sourceUrl,
    zillowUrl: fetched.zillowUrl,
    parsedZpid: parsed.zpid,
    fallbackAddress: parsed.addressHint?.keyword ?? null,
    importedFromUrl: parsed.canonicalUrl,
    importedPlatform: parsed.platform,
    importedListingId: parsed.listingId,
  });
}

/** @deprecated Prefer importListingFromQuery — kept for existing /import UI. */
export async function importListingFromUrl(
  sb: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    urlText: string;
  },
): Promise<ImportListingSuccess | ImportListingFailure> {
  return importListingFromQuery(sb, {
    userId: args.userId,
    projectId: args.projectId,
    query: args.urlText,
  });
}
