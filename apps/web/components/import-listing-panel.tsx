"use client";

import { useEffect, useState } from "react";

import { ImportListingClient } from "@/components/import-listing-client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ProjectRow } from "@/lib/projects";
import { cn } from "@/lib/utils";

export function ImportListingPanel({
  projects,
  initialProjectId = "",
  initialUrl = "",
  lockProject = false,
  triggerLabel = "Import listing",
  triggerVariant = "secondary",
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  projects: ProjectRow[];
  /** Prefill / lock target when opened from a project. */
  initialProjectId?: string;
  initialUrl?: string;
  /** Hide the project picker (project detail context). */
  lockProject?: boolean;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  triggerClassName?: string;
  /** Optional controlled open (e.g. deep-link). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  // Remount form when reopening so URL/result state resets cleanly.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          className={cn(triggerClassName)}
        >
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import listing</SheetTitle>
          <SheetDescription>
            {lockProject
              ? "Paste a listing URL or street address to underwrite it in this project."
              : "Paste a listing URL or street address, pick a project, and underwrite."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-2">
          <ImportListingClient
            key={formKey}
            projects={projects}
            initialUrl={initialUrl}
            initialProjectId={initialProjectId}
            lockProject={lockProject}
            compact
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
