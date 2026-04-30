import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDetailClient } from "@/components/project-detail-client";
import { listDeals } from "@/lib/deals";
import { getProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  let project;
  try {
    project = await getProject(supabase, id);
  } catch {
    notFound();
  }
  const initialDeals = await listDeals(supabase, id).catch(() => []);

  return (
    <div>
      <Link href="/projects" className="text-textMuted text-sm hover:text-text">
        ← Projects
      </Link>
      <ProjectDetailClient project={project} initialDeals={initialDeals} />
    </div>
  );
}
