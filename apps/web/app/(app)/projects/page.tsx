import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import { listProjects, type ProjectRow } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  let projects: ProjectRow[] = [];
  let error: string | null = null;
  try {
    projects = await listProjects(supabase);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectListItem key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectListItem({ project }: { project: ProjectRow }) {
  const market = formatMarket(project.constraints.markets[0]);
  const c = project.constraints;
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-surface border border-border rounded-2xl p-4 hover:border-border/80 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-text text-lg font-semibold truncate flex-1">
          {project.name}
        </p>
        <span className="text-textMuted text-xs capitalize">{project.status}</span>
      </div>
      <p className="text-textMuted text-sm line-clamp-2 mb-3">
        {project.raw_prompt}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge>{market}</Badge>
        <Badge>{c.strategy}</Badge>
        {c.priceMax ? <Badge>≤ {formatMoney(c.priceMax)}</Badge> : null}
        {c.targetMonthlyCashflow ? (
          <Badge>{formatMoney(c.targetMonthlyCashflow)}/mo</Badge>
        ) : null}
        <Badge>DSCR ≥ {c.minDSCR.toFixed(2)}</Badge>
      </div>
      {project.last_scout_at ? (
        <p className="text-textMuted text-xs mt-3">
          Last scout {formatDate(project.last_scout_at)}
        </p>
      ) : null}
    </Link>
  );
}
