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
  // Deals are permanent rows — an empty result here should only ever mean
  // "no deals scouted yet". If the read *fails* (deploy in progress,
  // transient network error), say so instead of silently rendering an
  // empty grid that looks like the deals vanished; the client retries on
  // mount either way.
  let initialDeals: Awaited<ReturnType<typeof listDeals>> = [];
  let initialLoadFailed = false;
  try {
    initialDeals = await listDeals(supabase, id);
  } catch {
    initialLoadFailed = true;
  }

  return (
    <div>
      <Link href="/projects" className="text-textMuted text-sm hover:text-text">
        ← Projects
      </Link>
      <ProjectDetailClient
        project={project}
        initialDeals={initialDeals}
        initialLoadFailed={initialLoadFailed}
      />
    </div>
  );
}
