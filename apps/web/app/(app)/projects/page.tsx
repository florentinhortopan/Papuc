import { ProjectsPageClient } from "@/components/projects-page-client";
import {
  listProjectsWithPreviews,
  type ProjectListItem,
} from "@/lib/projects";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ importUrl?: string }>;
}) {
  const sp = await searchParams;
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
    <ProjectsPageClient
      projects={projects}
      subscriptionTier={subscriptionTier}
      error={error}
      initialImportUrl={
        typeof sp.importUrl === "string" ? sp.importUrl : undefined
      }
    />
  );
}
