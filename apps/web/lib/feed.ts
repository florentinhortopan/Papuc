/**
 * Discover feed composer.
 * Spine (own deals) is required. Social (public + Friends + names) is soft-fail.
 */
import type { ProjectConstraints } from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  attachOwnerDisplayNames,
  listFriendsFeedDeals,
  listPublicFeedPool,
  mergePublicIntoSpine,
} from "./feed-social";
import {
  buildSpineSections,
  dedupeByListing,
  filterFeedDeals,
  listOwnFeedPool,
  type FeedDeal,
  type FeedTasteSummary,
} from "./feed-spine";

export type {
  FeedDeal,
  FeedProjectRef,
  FeedTasteSummary,
} from "./feed-spine";

export { filterFeedDeals } from "./feed-spine";

export type FeedChip =
  | "for_you"
  | "new"
  | "searches"
  | "saved"
  | "skipped"
  | "friends"
  | "best"
  | "profitable";

export const FEED_CHIPS: Array<{ id: FeedChip; label: string }> = [
  { id: "for_you", label: "For you" },
  { id: "new", label: "New" },
  { id: "searches", label: "Based on searches" },
  { id: "saved", label: "Saved" },
  { id: "skipped", label: "Skipped" },
  { id: "friends", label: "Friends" },
  { id: "best", label: "Best rated" },
  { id: "profitable", label: "Most profitable" },
];

export type PersonalizedFeed = {
  forYou: FeedDeal[];
  newForYou: FeedDeal[];
  basedOnSearches: FeedDeal[];
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  saved: FeedDeal[];
  skipped: FeedDeal[];
  friends: FeedDeal[];
  taste: FeedTasteSummary | null;
  /** Present when public/Friends/profiles enrichment failed — spine still valid. */
  socialError?: string | null;
};

/** @deprecated Prefer PersonalizedFeed — kept for gradual callers. */
export type FeedSections = {
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  latest: FeedDeal[];
};

/**
 * Personalized Discover payload.
 * 1) Own-deals spine (hard) → core chips
 * 2) Public + Friends + display names (soft) → enrich / fill Friends
 */
export async function listPersonalizedFeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<PersonalizedFeed> {
  const spine = await buildSpineSections(supabase, userId);

  let friends: FeedDeal[] = [];
  let socialError: string | null = null;
  let chips = {
    forYou: spine.forYou,
    newForYou: spine.newForYou,
    basedOnSearches: spine.basedOnSearches,
    bestRated: spine.bestRated,
    mostProfitable: spine.mostProfitable,
  };

  const social = await Promise.allSettled([
    listPublicFeedPool(supabase, userId),
    listFriendsFeedDeals(supabase, userId),
  ]);

  const publicResult = social[0];
  const friendsResult = social[1];

  if (publicResult.status === "fulfilled") {
    chips = mergePublicIntoSpine(chips, publicResult.value);
  } else {
    socialError =
      publicResult.reason instanceof Error
        ? publicResult.reason.message
        : String(publicResult.reason);
  }

  if (friendsResult.status === "fulfilled") {
    friends = friendsResult.value;
  } else {
    const msg =
      friendsResult.reason instanceof Error
        ? friendsResult.reason.message
        : String(friendsResult.reason);
    socialError = socialError ? `${socialError}; ${msg}` : msg;
  }

  const nameSafe = async (deals: FeedDeal[]): Promise<FeedDeal[]> => {
    if (deals.length === 0) return deals;
    try {
      return await attachOwnerDisplayNames(supabase, deals);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      socialError = socialError ? `${socialError}; ${msg}` : msg;
      return deals;
    }
  };

  const [
    forYou,
    newForYou,
    basedOnSearches,
    bestRated,
    mostProfitable,
    saved,
    skipped,
    friendsNamed,
  ] = await Promise.all([
    nameSafe(chips.forYou),
    nameSafe(chips.newForYou),
    nameSafe(chips.basedOnSearches),
    nameSafe(chips.bestRated),
    nameSafe(chips.mostProfitable),
    nameSafe(spine.saved),
    nameSafe(spine.skipped),
    nameSafe(friends),
  ]);

  return {
    forYou,
    newForYou,
    basedOnSearches,
    bestRated,
    mostProfitable,
    saved,
    skipped,
    friends: friendsNamed,
    taste: spine.taste,
    socialError,
  };
}

/** Legacy sections helper. Prefer listPersonalizedFeed. */
export async function listFeedSections(
  supabase: SupabaseClient,
): Promise<FeedSections> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { bestRated: [], mostProfitable: [], latest: [] };
  }
  const feed = await listPersonalizedFeed(supabase, user.id);
  return {
    bestRated: feed.bestRated,
    mostProfitable: feed.mostProfitable,
    latest: feed.newForYou.length ? feed.newForYou : feed.forYou,
  };
}

/** Own + public pool for AI filter / search (social soft-fail). */
export async function listPublicFeedDeals(
  supabase: SupabaseClient,
  limit = 120,
): Promise<FeedDeal[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const own = await listOwnFeedPool(supabase, user.id);
  const pub = await listPublicFeedPool(supabase, user.id).catch(
    () => [] as FeedDeal[],
  );
  return dedupeByListing([...own, ...pub], limit * 2)
    .sort(
      (a, b) =>
        Date.parse(b.last_refreshed_at) - Date.parse(a.last_refreshed_at),
    )
    .slice(0, limit);
}

export async function searchFeedDeals(
  supabase: SupabaseClient,
  constraints: ProjectConstraints,
): Promise<FeedDeal[]> {
  const pool = await listPublicFeedDeals(supabase, 200);
  const filtered = filterFeedDeals(pool, constraints);
  return filtered
    .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0))
    .slice(0, 48);
}

/** Resolve the deal list for a chip selection. */
export function dealsForChip(
  feed: PersonalizedFeed,
  chip: FeedChip,
): FeedDeal[] {
  switch (chip) {
    case "for_you":
      return feed.forYou;
    case "new":
      return feed.newForYou;
    case "searches":
      return feed.basedOnSearches;
    case "saved":
      return feed.saved;
    case "skipped":
      return feed.skipped;
    case "friends":
      return feed.friends;
    case "best":
      return feed.bestRated;
    case "profitable":
      return feed.mostProfitable;
    default:
      return feed.forYou;
  }
}
