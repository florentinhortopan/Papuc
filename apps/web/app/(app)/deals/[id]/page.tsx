import Link from "next/link";
import { notFound } from "next/navigation";

import { DealDetailClient } from "@/components/deal-detail-client";
import { getDeal } from "@/lib/deals";
import { getProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  let deal;
  try {
    deal = await getDeal(supabase, id);
  } catch {
    notFound();
  }
  let project;
  try {
    project = await getProject(supabase, deal.project_id);
  } catch {
    notFound();
  }

  return (
    <div>
      <Link
        href={`/projects/${project.id}`}
        className="text-textMuted text-sm hover:text-text"
      >
        ← {project.name}
      </Link>
      <DealDetailClient deal={deal} project={project} />
    </div>
  );
}
