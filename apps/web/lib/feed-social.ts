/**
 * Discover social layer: public shelf + Friends.
 * Soft-fail only — never blocks the own-deals spine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  POOL_LIMIT,
  SECTION_LIMIT,
  dedupeByListing,
  fetchDealsForProjectIds,
  listDismissedListingKeys,
  listingKey,
  type FeedDeal,
} from "./feed-spine";
import {
  getPublicProfiles,
  listFollowingIds,
  listWatchedProjectIds,
  publicDisplayName,
} from "./social";

/** Other investors' public projects (excludes viewer). */
export async function listPublicFeedPool(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("is_public", true)
    .neq("owner_id", userId)
    .limit(200);
  if (error) throw error;
  const projectIds = (data ?? []).map((row) => row.id as string);
  const deals = await fetchDealsForProjectIds(supabase, {
    userId,
    projectIds,
    limit: POOL_LIMIT,
  });
  return dedupeByListing(deals, POOL_LIMIT);
}

/** Deals from followed users' public projects ∪ watched public projects. */
export async function listFriendsFeedDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  const [followingIds, watchedIds] = await Promise.all([
    listFollowingIds(supabase, userId),
    listWatchedProjectIds(supabase, userId),
  ]);

  if (followingIds.length === 0 && watchedIds.length === 0) {
    return [];
  }

  const dismissed = await listDismissedListingKeys(supabase, userId);
  const projectIdSet = new Set<string>(watchedIds);

  if (followingIds.length > 0) {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("is_public", true)
      .in("owner_id", followingIds)
      .neq("owner_id", userId)
      .limit(200);
    if (error) throw error;
    for (const row of data ?? []) projectIdSet.add(row.id as string);
  }

  const projectIds = [...projectIdSet];
  if (projectIds.length === 0) return [];

  const deals = await fetchDealsForProjectIds(supabase, {
    userId,
    projectIds,
    limit: POOL_LIMIT,
  });

  const filtered = deals.filter(
    (d) => !d.isOwn && !dismissed.has(listingKey(d)),
  );
  return dedupeByListing(
    filtered.sort(
      (a, b) =>
        (b.score?.score ?? 0) - (a.score?.score ?? 0) ||
        Date.parse(b.last_refreshed_at) - Date.parse(a.last_refreshed_at),
    ),
    SECTION_LIMIT,
  );
}

export async function attachOwnerDisplayNames(
  supabase: SupabaseClient,
  deals: FeedDeal[],
): Promise<FeedDeal[]> {
  const ownerIds = deals.map((d) => d.project.owner_id);
  const profiles = await getPublicProfiles(supabase, ownerIds);
  return deals.map((d) => {
    const profile = profiles.get(d.project.owner_id);
    return {
      ...d,
      ownerDisplayName: profile
        ? publicDisplayName(profile)
        : d.ownerDisplayName ?? null,
      ownerAvatarUrl: profile?.avatar_url ?? d.ownerAvatarUrl ?? null,
    };
  });
}

/** Stamp display names + whether the viewer already follows each owner. */
export async function attachOwnerSocial(
  supabase: SupabaseClient,
  viewerId: string,
  deals: FeedDeal[],
): Promise<FeedDeal[]> {
  if (deals.length === 0) return deals;
  const [named, followingIds] = await Promise.all([
    attachOwnerDisplayNames(supabase, deals),
    listFollowingIds(supabase, viewerId),
  ]);
  const following = new Set(followingIds);
  return named.map((d) => ({
    ...d,
    isFollowingOwner: following.has(d.project.owner_id),
  }));
}

/** Merge public deals into spine chip lists (deduped). Soft enrichment only. */
export function mergePublicIntoSpine(
  spine: {
    forYou: FeedDeal[];
    newForYou: FeedDeal[];
    basedOnSearches: FeedDeal[];
    bestRated: FeedDeal[];
    mostProfitable: FeedDeal[];
  },
  publicDeals: FeedDeal[],
): typeof spine {
  if (publicDeals.length === 0) return spine;

  const byScore = [...publicDeals].sort(
    (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
  );
  const byCashflow = [...publicDeals].sort(
    (a, b) =>
      (b.score?.monthly_cashflow ?? -Infinity) -
      (a.score?.monthly_cashflow ?? -Infinity),
  );
  const byNew = publicDeals.filter((d) => d.isNew);

  return {
    forYou: dedupeByListing([...spine.forYou, ...byScore], SECTION_LIMIT),
    newForYou: dedupeByListing(
      [...spine.newForYou, ...byNew],
      SECTION_LIMIT,
    ),
    basedOnSearches: spine.basedOnSearches,
    bestRated: dedupeByListing(
      [...spine.bestRated, ...byScore],
      SECTION_LIMIT,
    ),
    mostProfitable: dedupeByListing(
      [...spine.mostProfitable, ...byCashflow],
      SECTION_LIMIT,
    ),
  };
}
