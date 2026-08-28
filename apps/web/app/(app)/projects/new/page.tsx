import type { Metadata } from "next";
import { Suspense } from "react";

import { NewProjectForm } from "@/components/new-project-form";
import { PAGE_DESCRIPTIONS } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "New project",
  description: PAGE_DESCRIPTIONS.projectsNew,
};

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Suspense fallback={<p className="text-textMuted text-sm">Loading…</p>}>
        <NewProjectForm />
      </Suspense>
    </div>
  );
}
