"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ImportListingPanel } from "@/components/import-listing-panel";
import { ProjectListItemCard } from "@/components/project-list-item-card";
import { Button } from "@/components/ui/button";
import type { SubscriptionTier } from "@/lib/database.types";
import type { ProjectListItem } from "@/lib/projects";

export function ProjectsPageClient({
  projects,
  subscriptionTier,
  error,
  initialImportUrl,
}: {
  projects: ProjectListItem[];
  subscriptionTier: SubscriptionTier;
  error: string | null;
  /** From old /import?url=… redirects. */
  initialImportUrl?: string;
}) {
  const [importOpen, setImportOpen] = useState(Boolean(initialImportUrl));

  useEffect(() => {
    if (initialImportUrl) setImportOpen(true);
  }, [initialImportUrl]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-textMuted text-sm mt-1">
            Describe a deal you want; let the agent scout it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {projects.length > 0 ? (
            <ImportListingPanel
              projects={projects}
              triggerLabel="Import"
              triggerVariant="secondary"
              open={importOpen}
              onOpenChange={setImportOpen}
              initialUrl={initialImportUrl}
            />
          ) : null}
          <Button asChild>
            <Link href="/projects/new">+ New project</Link>
          </Button>
        </div>
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
            describe what you&apos;re looking for.
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
