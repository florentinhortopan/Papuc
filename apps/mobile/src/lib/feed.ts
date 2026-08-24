import { apiFetch } from "./api";

export type FeedRailId =
  | "forYou"
  | "newForYou"
  | "basedOnSearches"
  | "bestRated"
  | "mostProfitable"
  | "saved"
  | "friends";

export type FeedDeal = {
  id: string;
  project_id?: string;
  address: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  est_value: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  primary_image_url: string | null;
  photos?: string[] | null;
  score: {
    score?: number | null;
    dscr?: number | null;
    monthly_cashflow?: number | null;
  } | null;
  project: { id: string; name: string; owner_id: string };
  ownerDisplayName?: string | null;
  isOwn?: boolean;
};

export type PersonalizedFeed = {
  forYou: FeedDeal[];
  newForYou: FeedDeal[];
  basedOnSearches: FeedDeal[];
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  saved: FeedDeal[];
  skipped: FeedDeal[];
  friends: FeedDeal[];
};

export const FEED_CHIPS: Array<{ id: FeedRailId; label: string }> = [
  { id: "forYou", label: "For you" },
  { id: "newForYou", label: "New" },
  { id: "friends", label: "Friends" },
  { id: "mostProfitable", label: "Cashflow" },
  { id: "bestRated", label: "Top score" },
  { id: "basedOnSearches", label: "Searches" },
  { id: "saved", label: "Saved" },
];

export async function fetchPersonalizedFeed(): Promise<PersonalizedFeed> {
  return apiFetch<PersonalizedFeed>("/api/feed");
}

export function railDeals(
  feed: PersonalizedFeed,
  id: FeedRailId,
): FeedDeal[] {
  return feed[id] ?? [];
}

export function dealProjectId(d: FeedDeal): string {
  return d.project_id ?? d.project?.id ?? "";
}

export function dealImageUrl(d: FeedDeal): string | null {
  if (d.primary_image_url?.trim()) return d.primary_image_url.trim();
  const first = Array.isArray(d.photos) ? d.photos[0] : null;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

export function dealLabel(d: FeedDeal): string {
  if (d.address?.trim()) return d.address.trim();
  if (d.city && d.state) return `${d.city}, ${d.state}`;
  return "Listing";
}
