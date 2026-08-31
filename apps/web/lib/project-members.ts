import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectMemberRole, ProjectMembersRow } from "./database.types";
import { getPublicProfiles, publicDisplayName } from "./social";

export type ProjectAccess = {
  role: ProjectMemberRole | "owner" | null;
  /** Scout + deal writes. */
  canEdit: boolean;
  /** Invite, settings, delete project. */
  canManage: boolean;
  isMember: boolean;
};

export type ProjectMemberListItem = {
  userId: string;
  role: ProjectMemberRole;
  displayName: string;
  createdAt: string;
};

export async function getProjectAccess(
  supabase: SupabaseClient,
  project: { id: string; owner_id: string },
  userId: string | null | undefined,
): Promise<ProjectAccess> {
  if (!userId) {
    return {
      role: null,
      canEdit: false,
      canManage: false,
      isMember: false,
    };
  }
  if (userId === project.owner_id) {
    return {
      role: "owner",
      canEdit: true,
      canManage: true,
      isMember: false,
    };
  }

  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      role: null,
      canEdit: false,
      canManage: false,
      isMember: false,
    };
  }

  const role = data.role as ProjectMemberRole;
  return {
    role,
    canEdit: role === "member" || role === "owner",
    canManage: false,
    isMember: true,
  };
}

export async function listProjectMembers(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectMemberListItem[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, user_id, role, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as ProjectMembersRow[];
  const profiles = await getPublicProfiles(
    supabase,
    rows.map((r) => r.user_id),
  );

  return rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      userId: row.user_id,
      role: row.role,
      displayName: profile
        ? publicDisplayName(profile)
        : `Investor ${row.user_id.slice(0, 8)}`,
      createdAt: row.created_at,
    };
  });
}
