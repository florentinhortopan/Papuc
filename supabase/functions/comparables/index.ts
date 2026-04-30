// Edge Function: comparables
// Input: { propertyId: string } | { dealId: string }
// Output: { comparables: MLSListingSummary[] }

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authedUser, getServiceClient } from "../_shared/supabase.ts";
import { RealEstateAPIClient, type MLSListingSummary } from "../_shared/realestate.ts";

interface CompsRequest {
  propertyId?: string;
  dealId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const user = await authedUser(req);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: CompsRequest;
  try {
    body = (await req.json()) as CompsRequest;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  let propertyId = body.propertyId ?? "";
  if (!propertyId && body.dealId) {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("deals")
      .select("source_property_id, project_id")
      .eq("id", body.dealId)
      .single();
    if (error || !data) return jsonResponse({ error: "deal not found" }, 404);
    propertyId = data.source_property_id;
  }
  if (!propertyId) return jsonResponse({ error: "propertyId or dealId required" }, 400);

  const reaKey = Deno.env.get("REALESTATEAPI_KEY");
  if (!reaKey) return jsonResponse({ error: "REALESTATEAPI_KEY not set" }, 500);

  try {
    const rea = new RealEstateAPIClient({ apiKey: reaKey });
    // RealEstateAPI's PropertyComps endpoint takes a property id and returns comparables.
    // We invoke it via the same fetch base since our client has mlsSearch + propertyDetail; for comps we'll
    // use a small inline call.
    const res = await fetch("https://api.realestateapi.com/v2/PropertyComps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": reaKey,
        "x-user-id": "papuc-app",
      },
      body: JSON.stringify({ id: propertyId }),
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: `RealEstateAPI ${res.status}: ${text}` }, 502);
    }
    const json = (await res.json()) as { data?: unknown[] };
    const comps = (json.data ?? []).slice(0, 10).map((c: any) => ({
      id: String(c.id ?? c.propertyId ?? ""),
      address: c.address?.fullAddress ?? c.address,
      city: c.address?.city,
      state: c.address?.state,
      zip: c.address?.zip,
      price: c.lastSalePrice ?? c.price ?? c.estimatedValue,
      beds: c.beds ?? c.propertyInfo?.bedroomsCount,
      baths: c.baths ?? c.propertyInfo?.bathroomsCount,
      sqft: c.sqft ?? c.propertyInfo?.livingSquareFeet,
      lat: c.propertyAddress?.latitude,
      lng: c.propertyAddress?.longitude,
      primaryListingImageUrl: c.media?.primaryListingImageUrl,
      daysOnMarket: c.daysOnMarket,
    })) as MLSListingSummary[];

    void rea;
    return jsonResponse({ comparables: comps });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
