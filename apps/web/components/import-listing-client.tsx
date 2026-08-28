"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDscr, formatMoney } from "@/lib/format";
import type { ProjectRow } from "@/lib/projects";
import { cn } from "@/lib/utils";

type ImportResult = {
  dealId: string;
  projectId: string;
  alreadyExisted: boolean;
  address: string | null;
  zpid: string | null;
  sourceUrl: string;
  monthlyCashflow: number;
  dscr: number;
  score: number;
};

export function ImportListingClient({
  projects,
  initialUrl = "",
  initialProjectId = "",
  lockProject = false,
  compact = false,
}: {
  projects: ProjectRow[];
  initialUrl?: string;
  initialProjectId?: string;
  /** When true, project select is hidden and initialProjectId is used. */
  lockProject?: boolean;
  /** Tighter layout for sheet / panel embedding. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [projectId, setProjectId] = useState(
    initialProjectId || projects[0]?.id || "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onImport() {
    if (!url.trim() || !projectId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/import/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: url.trim(), projectId }),
      });
      const body = (await res.json()) as ImportResult & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `Import failed (${res.status})`);
      }
      setResult(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (projects.length === 0) {
    return (
      <div
        className={cn(
          "bg-surface border border-border rounded-2xl p-6",
          !compact && "max-w-lg",
        )}
      >
        <p className="text-text text-sm font-semibold mb-2">Create a project first</p>
        <p className="text-textMuted text-sm mb-4 leading-6">
          Imports attach the listing to one of your projects so underwriting
          uses that project&apos;s strategy and capital assumptions.
        </p>
        <Button asChild>
          <Link href="/projects/new">New project</Link>
        </Button>
      </div>
    );
  }

  const lockedName =
    lockProject && projectId
      ? projects.find((p) => p.id === projectId)?.name
      : null;

  return (
    <div className={cn("space-y-4", !compact && "max-w-lg")}>
      <div
        className={cn(
          "space-y-3",
          compact
            ? ""
            : "bg-surface border border-border rounded-2xl p-4",
        )}
      >
        <Textarea
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Listing URL or street address (city + state/ZIP)"
          className="min-h-24"
        />
        <p className="text-textMuted text-xs leading-5">
          Paste a Zillow / Redfin / Realtor / Homes link or a US street address.
          We resolve via Zillow (HasData) — never fetch arbitrary sites.
        </p>

        {lockProject ? (
          lockedName ? (
            <p className="text-textMuted text-xs">
              Adding to{" "}
              <span className="text-text font-medium">{lockedName}</span>
            </p>
          ) : null
        ) : (
          <div>
            <label className="text-textMuted text-xs">Add to project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
            <p className="text-danger text-xs">{error}</p>
          </div>
        ) : null}

        <Button
          onClick={() => void onImport()}
          loading={loading}
          disabled={!url.trim() || !projectId}
          className="w-full"
        >
          Import listing
        </Button>
      </div>

      {result ? (
        <div
          className={cn(
            "bg-surfaceAlt border rounded-2xl p-4 space-y-3",
            "border-primary/40",
          )}
        >
          <p className="text-text text-sm font-semibold">
            {result.alreadyExisted ? "Updated existing deal" : "Imported"}
          </p>
          <p className="text-text text-base font-semibold leading-snug">
            {result.address ?? "Address pending"}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-border bg-surface px-2 py-1">
              Score {result.score}
            </span>
            <span className="rounded-lg border border-border bg-surface px-2 py-1">
              DSCR {formatDscr(result.dscr)}
            </span>
            <span className="rounded-lg border border-border bg-surface px-2 py-1">
              {result.monthlyCashflow >= 0 ? "+" : ""}
              {formatMoney(result.monthlyCashflow)}/mo
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => router.push(`/deals/${result.dealId}`)}
            >
              Open deal
            </Button>
            {!lockProject ? (
              <Button asChild variant="secondary" className="flex-1">
                <Link href={`/projects/${result.projectId}`}>Project</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
