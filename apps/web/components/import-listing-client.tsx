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
}: {
  projects: ProjectRow[];
  initialUrl?: string;
  initialProjectId?: string;
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
        body: JSON.stringify({ url: url.trim(), projectId }),
      });
      const body = (await res.json()) as ImportResult & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `Import failed (${res.status})`);
      }
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 max-w-lg">
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

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <Textarea
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.zillow.com/homedetails/…/…_zpid/"
          className="min-h-24"
        />
        <p className="text-textMuted text-xs leading-5">
          Paste a Zillow property link (homedetails). We only call our listing
          providers — never fetch arbitrary sites. Redfin / Realtor support
          comes next.
        </p>

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
            "bg-surface border rounded-2xl p-4 space-y-3",
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
            <span className="rounded-lg border border-border bg-surfaceAlt px-2 py-1">
              Score {result.score}
            </span>
            <span className="rounded-lg border border-border bg-surfaceAlt px-2 py-1">
              DSCR {formatDscr(result.dscr)}
            </span>
            <span className="rounded-lg border border-border bg-surfaceAlt px-2 py-1">
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
            <Button asChild variant="secondary" className="flex-1">
              <Link href={`/projects/${result.projectId}`}>Project</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
