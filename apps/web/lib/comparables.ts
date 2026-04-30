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
}

export async function fetchComparables(
  dealId: string,
): Promise<ComparableListing[]> {
  const res = await fetch(`/api/deals/${dealId}/comparables`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `comparables ${res.status}`);
  }
  const json = (await res.json()) as { comparables: ComparableListing[] };
  return json.comparables ?? [];
}
