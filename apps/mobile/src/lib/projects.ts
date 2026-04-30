import { ProjectConstraintsSchema, type ProjectConstraints } from "@papuc/core";

import { supabase } from "./supabase";
import type { ProjectsRow, ProjectStatus } from "./database.types";

export type ProjectRow = ProjectsRow & {
  constraints: ProjectConstraints;
};

function hydrate(row: ProjectsRow): ProjectRow {
  return {
    ...row,
    constraints: ProjectConstraintsSchema.parse(row.constraints),
  };
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProjectsRow[]).map(hydrate);
}

export async function getProject(id: string): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return hydrate(data as ProjectsRow);
}

export async function createProject(input: {
  name: string;
  rawPrompt: string;
  constraints: ProjectConstraints;
  status?: ProjectStatus;
}): Promise<ProjectRow> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");
  const insertRow = {
    owner_id: userId,
    name: input.name,
    raw_prompt: input.rawPrompt,
    constraints: input.constraints,
    status: input.status ?? "active",
  };
  const { data, error } = await (supabase.from("projects") as any)
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw error;
  return hydrate(data as ProjectsRow);
}

export async function updateProject(
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
  const { error } = await (supabase.from("projects") as any)
    .update(update)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function parseProjectPrompt(
  prompt: string,
): Promise<ProjectConstraints> {
  const { data, error } = await supabase.functions.invoke<{ constraints: unknown }>(
    "parse-project-goals",
    { body: { prompt } },
  );
  if (error) throw error;
  if (!data?.constraints) throw new Error("no constraints returned");
  return ProjectConstraintsSchema.parse(data.constraints);
}
