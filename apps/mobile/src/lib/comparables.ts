import { apiFetch } from "./api";

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

export async function getComparables(
  dealId: string,
): Promise<ComparableListing[]> {
  try {
    const data = await apiFetch<{ comparables?: ComparableListing[] }>(
      `/api/deals/${dealId}/comparables`,
      { method: "POST", body: JSON.stringify({}) },
    );
    return data?.comparables ?? [];
  } catch {
    return [];
  }
}
