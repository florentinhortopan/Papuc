import { ProjectConstraintsSchema, type ProjectConstraints } from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectStatus, ProjectsRow } from "./database.types";

export type ProjectRow = ProjectsRow & {
  constraints: ProjectConstraints;
};

function hydrate(row: ProjectsRow): ProjectRow {
  return {
    ...row,
    constraints: ProjectConstraintsSchema.parse(row.constraints),
  };
}

export async function listProjects(
  supabase: SupabaseClient,
): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
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
  },
): Promise<ProjectRow> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const insertRow = {
    owner_id: userId,
    name: input.name,
    raw_prompt: input.rawPrompt,
    constraints: input.constraints,
    status: input.status ?? "active",
  };
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
  }>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.constraints !== undefined) update.constraints = patch.constraints;
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
