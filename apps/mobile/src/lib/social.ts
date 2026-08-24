import { apiFetch } from "./api";
import { supabase } from "./supabase";

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

export async function scoutLikeThis(dealId: string): Promise<{ projectId: string }> {
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

export async function getSessionUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
