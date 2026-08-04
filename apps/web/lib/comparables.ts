export interface ComparableListing {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  primaryListingImageUrl?: string;
  daysOnMarket?: number;
  alreadyInProject?: boolean;
  distanceMiles?: number;
  papucScore?: number | null;
}

export interface ScoutComparablesResponse {
  comparables: ComparableListing[];
  added: number;
  refreshed: number;
  note?: string;
  query?: Record<string, unknown>;
}

export interface ScoutComparablesInput {
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
}

export async function scoutComparables(
  dealId: string,
  input: ScoutComparablesInput = {},
): Promise<ScoutComparablesResponse> {
  const res = await fetch(`/api/deals/${dealId}/comparables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `comparables ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      const t = await res.text().catch(() => "");
      if (t) message = t;
    }
    throw new Error(message);
  }
  const json = (await res.json()) as {
    comparables?: Array<{
      dealId: string;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      price?: number | null;
      beds?: number | null;
      baths?: number | null;
      sqft?: number | null;
      primaryListingImageUrl?: string | null;
      daysOnMarket?: number | null;
      alreadyInProject?: boolean;
      distanceMiles?: number;
      papucScore?: number | null;
    }>;
    added?: number;
    refreshed?: number;
    note?: string;
    query?: Record<string, unknown>;
  };

  return {
    comparables: (json.comparables ?? []).map((c) => ({
      id: c.dealId,
      address: c.address ?? undefined,
      city: c.city ?? undefined,
      state: c.state ?? undefined,
      zip: c.zip ?? undefined,
      price: c.price ?? undefined,
      beds: c.beds ?? undefined,
      baths: c.baths ?? undefined,
      sqft: c.sqft ?? undefined,
      primaryListingImageUrl: c.primaryListingImageUrl ?? undefined,
      daysOnMarket: c.daysOnMarket ?? undefined,
      alreadyInProject: c.alreadyInProject,
      distanceMiles: c.distanceMiles,
      papucScore: c.papucScore,
    })),
    added: json.added ?? 0,
    refreshed: json.refreshed ?? 0,
    note: json.note,
    query: json.query,
  };
}
