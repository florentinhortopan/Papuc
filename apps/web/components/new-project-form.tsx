"use client";

import {
  detectPropertyLookupIntent,
  PROJECT_USE_CASE_LABELS,
  ProjectConstraintsSchema,
  type ProjectConstraints,
} from "@papuc/core";
import { Mic } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConstraintReview } from "@/components/constraint-review";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  VoiceConcierge,
  VOICE_TRANSCRIPT_KEY,
} from "@/components/voice-concierge";
import { formatMarket } from "@/lib/format";
import { createProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";

export { ConstraintReview } from "./constraint-review";

const SAMPLE_PROMPTS = [
  "I have $200k down and want $600/month cashflow on single family homes in Austin, TX.",
  "Family of 4 wants a mountain retreat near Tahoe — live a few years, then Airbnb.",
  "Looking for land in California to develop in 5 years.",
  "Want a cafe with living upstairs in the East Bay.",
];

type Step = "prompt" | "review";

async function parseProjectPrompt(prompt: string): Promise<ProjectConstraints> {
  const res = await fetch("/api/projects/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `parse failed (${res.status})`);
  }
  const json = (await res.json()) as { constraints: unknown };
  return ProjectConstraintsSchema.parse(json.constraints);
}

export function defaultProjectName(c: ProjectConstraints): string {
  const useCase = c.intent?.useCase;
  const label =
    useCase && useCase !== "unclear"
      ? PROJECT_USE_CASE_LABELS[useCase]
      : c.strategy;
  const markets =
    c.markets.length > 1
      ? `${formatMarket(c.markets[0])} +${c.markets.length - 1}`
      : formatMarket(c.markets[0]);
  return `${label} — ${markets}`;
}

export function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const voiceBootstrapped = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<Step>("prompt");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [constraints, setConstraints] = useState<ProjectConstraints | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  async function parse(overridePrompt?: string) {
    const text = (overridePrompt ?? prompt).trim();
    if (!text) return;
    setError(null);
    setParsing(true);
    try {
      if (overridePrompt != null) setPrompt(overridePrompt);

      const lookup = detectPropertyLookupIntent(text);
      if (lookup) {
        const res = await fetch("/api/import/listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: lookup.value }),
        });
        const body = (await res.json()) as {
          dealId?: string;
          error?: string;
        };
        if (res.ok && body.dealId) {
          router.push(`/deals/${body.dealId}`);
          return;
        }
        setError(
          body.error ??
            "Couldn’t find that property. Keep describing your goals, or try a fuller address / listing link.",
        );
        return;
      }

      const c = await parseProjectPrompt(text);
      setConstraints(c);
      setName(defaultProjectName(c));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }

  useEffect(() => {
    if (voiceBootstrapped.current) return;
    if (searchParams.get("from") !== "voice") return;
    voiceBootstrapped.current = true;
    let stored = "";
    try {
      stored = sessionStorage.getItem(VOICE_TRANSCRIPT_KEY) ?? "";
      sessionStorage.removeItem(VOICE_TRANSCRIPT_KEY);
    } catch {
      stored = "";
    }
    if (stored.trim()) {
      void parse(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function save() {
    if (!constraints) return;
    setError(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const row = await createProject(supabase, {
        name: name.trim() || "Untitled project",
        rawPrompt: prompt,
        constraints,
      });
      router.push(`/projects/${row.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (step === "prompt") {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-1">New project</h1>
        <p className="text-textMuted text-sm mb-6">
          Describe any life or investment goal in plain English — or paste a
          listing URL / street address to open that deal. Or talk it through with
          Papuc Concierge.
        </p>

        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVoiceOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/25 transition-colors"
          >
            <Mic className="h-4 w-4" />
            Talk to Papuc
          </button>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Family of 4 — mountain place near Tahoe, live a few years then Airbnb. We have about $80k."
          className="min-h-32 mb-4"
        />

        <p className="text-textMuted text-xs mb-2">Try one of these:</p>
        <div className="flex flex-col gap-2 mb-6">
          {SAMPLE_PROMPTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="text-left bg-surface border border-border rounded-2xl p-3 text-sm hover:border-border/80 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-4">
            <p className="text-danger text-xs">{error}</p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void parse()}
            loading={parsing}
            disabled={!prompt.trim()}
            className="flex-1"
          >
            Parse goals
          </Button>
        </div>

        <VoiceConcierge
          open={voiceOpen}
          onOpenChange={setVoiceOpen}
          variant="ongoing"
          completionMode="handoff"
          onTranscript={(t) => {
            void parse(t);
          }}
        />
      </div>
    );
  }

  if (!constraints) return null;

  return (
    <ConstraintReview
      name={name}
      setName={setName}
      constraints={constraints}
      setConstraints={setConstraints}
      onBack={() => setStep("prompt")}
      onSave={save}
      saving={saving}
      error={error}
    />
  );
}
