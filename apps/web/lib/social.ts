import type { SupabaseClient } from "@supabase/supabase-js";

import type { SubscriptionTier } from "./database.types";

export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  created_at: string;
};

export type InvestorProfile = PublicProfile & {
  followerCount: number;
  followingCount: number;
  publicProjectCount: number;
  isFollowing: boolean;
  isSelf: boolean;
};

function displayFallback(id: string, name: string | null): string {
  if (name?.trim()) return name.trim();
  return `Investor ${id.slice(0, 8)}`;
}

export function publicDisplayName(
  profile: Pick<PublicProfile, "id" | "display_name">,
): string {
  return displayFallback(profile.id, profile.display_name);
}

export async function getPublicProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, display_name, avatar_url, subscription_tier, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as PublicProfile;
}

export async function getPublicProfiles(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, PublicProfile>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, display_name, avatar_url, subscription_tier, created_at")
    .in("id", unique);
  if (error) throw error;
  for (const row of (data ?? []) as PublicProfile[]) {
    map.set(row.id, row);
  }
  return map;
}

export async function getInvestorProfile(
  supabase: SupabaseClient,
  userId: string,
  viewerId: string | null,
): Promise<InvestorProfile | null> {
  const profile = await getPublicProfile(supabase, userId);
  if (!profile) return null;

  const [followersRes, followingRes, projectsRes, followRes] =
    await Promise.all([
      supabase
        .from("user_follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", userId),
      supabase
        .from("user_follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", userId),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("is_public", true),
      viewerId && viewerId !== userId
        ? supabase
            .from("user_follows")
            .select("following_id")
            .eq("follower_id", viewerId)
            .eq("following_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (followersRes.error) throw followersRes.error;
  if (followingRes.error) throw followingRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (followRes.error) throw followRes.error;

  return {
    ...profile,
    followerCount: followersRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    publicProjectCount: projectsRes.count ?? 0,
    isFollowing: Boolean(followRes.data),
    isSelf: viewerId === userId,
  };
}

export async function followUser(
  supabase: SupabaseClient,
  followingId: string,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  if (userId === followingId) throw new Error("cannot follow yourself");
  const { error } = await supabase.from("user_follows").upsert(
    { follower_id: userId, following_id: followingId },
    { onConflict: "follower_id,following_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function unfollowUser(
  supabase: SupabaseClient,
  followingId: string,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", userId)
    .eq("following_id", followingId);
  if (error) throw error;
}

export async function listFollowingIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.following_id as string);
}

export async function isFollowingUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
): Promise<boolean> {
  if (followerId === followingId) return false;
  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function watchProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await supabase.from("project_watches").upsert(
    { user_id: userId, project_id: projectId },
    { onConflict: "user_id,project_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function unwatchProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const { error } = await supabase
    .from("project_watches")
    .delete()
    .eq("user_id", userId)
    .eq("project_id", projectId);
  if (error) throw error;
}

export async function isWatchingProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("project_watches")
    .select("project_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function countProjectWatchers(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("project_watches")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
}

export async function listWatchedProjectIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_watches")
    .select("project_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.project_id as string);
}

export async function updateDisplayName(
  supabase: SupabaseClient,
  displayName: string,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const trimmed = displayName.trim().slice(0, 80);
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed || null })
    .eq("id", userId);
  if (error) throw error;
}

export type SuggestedInvestor = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  publicProjectCount: number;
  isFollowing: boolean;
};

/**
 * Public Discover owners the viewer isn't following yet — cold-start for Friends.
 */
export async function listSuggestedInvestors(
  supabase: SupabaseClient,
  viewerId: string,
  limit = 6,
): Promise<SuggestedInvestor[]> {
  const followingIds = await listFollowingIds(supabase, viewerId);
  const following = new Set(followingIds);

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("is_public", true)
    .neq("owner_id", viewerId)
    .limit(200);
  if (error) throw error;

  const countByOwner = new Map<string, number>();
  for (const row of projects ?? []) {
    const ownerId = row.owner_id as string;
    if (!ownerId || following.has(ownerId)) continue;
    countByOwner.set(ownerId, (countByOwner.get(ownerId) ?? 0) + 1);
  }

  const ranked = [...countByOwner.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (ranked.length === 0) return [];

  const profiles = await getPublicProfiles(
    supabase,
    ranked.map(([id]) => id),
  );

  return ranked.map(([id, publicProjectCount]) => {
    const profile = profiles.get(id);
    return {
      id,
      displayName: profile
        ? publicDisplayName(profile)
        : `Investor ${id.slice(0, 8)}`,
      avatarUrl: profile?.avatar_url ?? null,
      publicProjectCount,
      isFollowing: false,
    };
  });
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Upload a square-ish profile photo to the public `avatars` bucket and
 * persist `profiles.avatar_url`. Replaces any prior object for this user.
 */
export async function uploadProfileAvatar(
  supabase: SupabaseClient,
  file: File,
): Promise<string> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  if (!AVATAR_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Image must be under 2 MB");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `${userId}/avatar.${ext}`;

  // Clear other extensions so we don't leave stale objects.
  await supabase.storage
    .from("avatars")
    .remove([
      `${userId}/avatar.jpg`,
      `${userId}/avatar.jpeg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
      `${userId}/avatar.gif`,
    ]);

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", userId);
  if (error) throw error;
  return url;
}

export async function clearProfileAvatar(
  supabase: SupabaseClient,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  await supabase.storage
    .from("avatars")
    .remove([
      `${userId}/avatar.jpg`,
      `${userId}/avatar.jpeg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
      `${userId}/avatar.gif`,
    ]);
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);
  if (error) throw error;
}
