import { apiFetch } from "./api";
import { supabase } from "./supabase";

export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: "free" | "pro";
  created_at: string;
};

export type InvestorProfile = PublicProfile & {
  followerCount: number;
  followingCount: number;
  publicProjectCount: number;
  isFollowing: boolean;
  isSelf: boolean;
};

export function publicDisplayName(
  profile: Pick<PublicProfile, "id" | "display_name">,
): string {
  if (profile.display_name?.trim()) return profile.display_name.trim();
  return `Investor ${profile.id.slice(0, 8)}`;
}

export async function followUser(userId: string): Promise<void> {
  await apiFetch(`/api/users/${userId}/follow`, { method: "POST" });
}

export async function unfollowUser(userId: string): Promise<void> {
  await apiFetch(`/api/users/${userId}/follow`, { method: "DELETE" });
}

export async function watchProject(projectId: string): Promise<void> {
  await apiFetch(`/api/projects/${projectId}/watch`, { method: "POST" });
}

export async function unwatchProject(projectId: string): Promise<void> {
  await apiFetch(`/api/projects/${projectId}/watch`, { method: "DELETE" });
}

export async function scoutLikeThis(
  dealId: string,
): Promise<{ projectId: string }> {
  const res = await apiFetch<{
    ok: boolean;
    projectId: string;
  }>(`/api/deals/${dealId}/scout-like-this`, {
    method: "POST",
    body: JSON.stringify({
      alsoFollowOwner: true,
      alsoWatchProject: true,
    }),
  });
  return { projectId: res.projectId };
}

export async function isWatchingProject(projectId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("project_watches")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function countProjectWatchers(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from("project_watches")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
}

export async function isFollowingUser(userId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === userId) return false;
  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", user.id)
    .eq("following_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getPublicProfile(
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

export async function getInvestorProfile(
  userId: string,
): Promise<InvestorProfile | null> {
  const viewerId = await getSessionUserId();
  const profile = await getPublicProfile(userId);
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

export async function listPublicProjectsForOwner(ownerId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, constraints, updated_at")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSessionUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
