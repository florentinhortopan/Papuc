import { ProjectConstraintsSchema, type ProjectConstraints } from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectStatus, ProjectsRow } from "./database.types";

export type ProjectRow = ProjectsRow & {
  constraints: ProjectConstraints;
};

function hydrate(row: ProjectsRow): ProjectRow {
  return {
    ...row,
    is_public: row.is_public ?? false,
    nightly_scout_enabled: row.nightly_scout_enabled ?? true,
    source_deal_id: row.source_deal_id ?? null,
    source_project_id: row.source_project_id ?? null,
    constraints: ProjectConstraintsSchema.parse(row.constraints),
  };
}

export async function listProjects(
  supabase: SupabaseClient,
): Promise<ProjectRow[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  // Explicit owner filter — RLS also allows reading public projects, which
  // must not leak into the user's own project grid.
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProjectsRow[]).map(hydrate);
}

/** Mosaic slots on the projects grid card (3×2). */
export const PROJECT_MOSAIC_SLOTS = 6;

export type ProjectListItem = ProjectRow & {
  dealCount: number;
  /** Always length `PROJECT_MOSAIC_SLOTS`; null = empty placeholder slot. */
  mosaicPhotos: (string | null)[];
};

/**
 * Projects for the grid page, enriched with scouted deal counts and up to
 * six distinct listing thumbnails for the card mosaic.
 */
export async function listProjectsWithPreviews(
  supabase: SupabaseClient,
): Promise<ProjectListItem[]> {
  const projects = await listProjects(supabase);
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);
  const { data: deals, error } = await supabase
    .from("deals")
    .select("project_id, primary_image_url, photos, last_refreshed_at")
    .in("project_id", ids)
    .eq("inventory_status", "live")
    .order("last_refreshed_at", { ascending: false });
  if (error) throw error;

  const byProject = new Map<string, { count: number; photos: string[] }>();
  for (const id of ids) byProject.set(id, { count: 0, photos: [] });

  for (const deal of deals ?? []) {
    const bucket = byProject.get(deal.project_id as string);
    if (!bucket) continue;
    bucket.count += 1;
    if (bucket.photos.length >= PROJECT_MOSAIC_SLOTS) continue;
    const fromPhotos = Array.isArray(deal.photos)
      ? (deal.photos as unknown[]).find(
          (p): p is string => typeof p === "string" && p.length > 0,
        )
      : undefined;
    const url =
      (typeof deal.primary_image_url === "string" && deal.primary_image_url
        ? deal.primary_image_url
        : null) ?? fromPhotos;
    if (url && !bucket.photos.includes(url)) bucket.photos.push(url);
  }

  return projects.map((project) => {
    const bucket = byProject.get(project.id) ?? { count: 0, photos: [] };
    const mosaicPhotos: (string | null)[] = Array.from(
      { length: PROJECT_MOSAIC_SLOTS },
      (_, i) => bucket.photos[i] ?? null,
    );
    return {
      ...project,
      dealCount: bucket.count,
      mosaicPhotos,
    };
  });
}

export async function listPublicProjectsForOwner(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProjectsRow[]).map(hydrate);
}

export async function getProject(
  supabase: SupabaseClient,
  id: string,
): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return hydrate(data as ProjectsRow);
}

export async function createProject(
  supabase: SupabaseClient,
  input: {
    name: string;
    rawPrompt: string;
    constraints: ProjectConstraints;
    status?: ProjectStatus;
    sourceDealId?: string | null;
    sourceProjectId?: string | null;
  },
): Promise<ProjectRow> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const insertRow: Record<string, unknown> = {
    owner_id: userId,
    name: input.name,
    raw_prompt: input.rawPrompt,
    constraints: input.constraints,
    status: input.status ?? "active",
  };
  if (input.sourceDealId) insertRow.source_deal_id = input.sourceDealId;
  if (input.sourceProjectId) {
    insertRow.source_project_id = input.sourceProjectId;
  }
  const { data, error } = await supabase
    .from("projects")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw error;
  return hydrate(data as ProjectsRow);
}

export async function updateProject(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    name: string;
    constraints: ProjectConstraints;
    status: ProjectStatus;
    nightly_scout_enabled: boolean;
    is_public: boolean;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.constraints !== undefined) update.constraints = patch.constraints;
  if (patch.nightly_scout_enabled !== undefined) {
    update.nightly_scout_enabled = patch.nightly_scout_enabled;
  }
  if (patch.is_public !== undefined) {
    update.is_public = patch.is_public;
  }
  const { error } = await supabase.from("projects").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}
