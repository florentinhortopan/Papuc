import { supabase } from "./supabase";

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

export async function getComparables(dealId: string): Promise<ComparableListing[]> {
  const { data, error } = await supabase.functions.invoke<{
    comparables: ComparableListing[];
  }>("comparables", { body: { dealId } });
  if (error) throw error;
  return data?.comparables ?? [];
}
