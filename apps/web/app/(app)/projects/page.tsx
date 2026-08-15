import Link from "next/link";

import { ProjectListItemCard } from "@/components/project-list-item-card";
import { Button } from "@/components/ui/button";
import {
  listProjectsWithPreviews,
  type ProjectListItem,
} from "@/lib/projects";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  let projects: ProjectListItem[] = [];
  let error: string | null = null;
  try {
    projects = await listProjectsWithPreviews(supabase);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const profile = await getProfile(supabase);
  const subscriptionTier = profile?.subscription_tier ?? "free";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-textMuted text-sm mt-1">
            Describe a deal you want; let the agent scout it.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">+ New project</Link>
        </Button>
      </div>

      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-4">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center">
          <p className="text-textMuted">
            No projects yet. Click <span className="text-text">+ New project</span> to
            describe what you're looking for.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
          {projects.map((project) => (
            <ProjectListItemCard
              key={project.id}
              project={project}
              subscriptionTier={subscriptionTier}
            />
          ))}
        </div>
      )}
    </div>
  );
}
