"use client";

import { Loader2, Mic, MicOff, PhoneOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  startVoiceSession,
  type VoiceProgressTopic,
  type VoiceSessionHandle,
  type VoiceSessionStatus,
} from "@/lib/voice/realtime-webrtc";
import { cn } from "@/lib/utils";

export const VOICE_TRANSCRIPT_KEY = "papuc.voiceTranscript";

/** Shape the Concierge transcript so /api/projects/parse keeps user dollars. */
export function formatVoiceTranscriptForParse(
  transcript: string,
  opts?: {
    summary?: string;
    progress?: Partial<Record<VoiceProgressTopic, string>>;
  },
): string {
  const parts: string[] = [
    "Voice Concierge intake (dialogue labeled User / Papuc).",
    "Extract ProjectConstraints from what the USER said.",
    "Every user-stated dollar amount must map to downPayment, totalCash, and/or priceMax.",
    'If role is unclear, put the amount in totalCash and explain in intent.capitalStory.',
  ];
  const chips = opts?.progress
    ? (["place", "budget", "use"] as const)
        .filter((t) => opts.progress?.[t])
        .map((t) => `${t}: ${opts.progress![t]}`)
        .join("; ")
    : "";
  if (chips) parts.push(`Progress chips from the call: ${chips}.`);
  if (opts?.summary?.trim()) {
    parts.push(`Concierge summary: ${opts.summary.trim()}`);
  }
  parts.push("", transcript.trim());
  return parts.join("\n");
}

type Phase = "call" | "finishing" | "opening_deal" | "error";

export function VoiceConcierge({
  open,
  onOpenChange,
  variant = "ongoing",
  completionMode = "create",
  onTranscript,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "first_run" | "ongoing";
  /**
   * create — stash transcript and open /projects/new review flow.
   * handoff — return transcript to the parent (e.g. already on new-project form).
   */
  completionMode?: "create" | "handoff";
  onTranscript?: (transcript: string) => void;
}) {
  const router = useRouter();
  const sessionRef = useRef<VoiceSessionHandle | null>(null);
  const completingRef = useRef(false);
  const progressRef = useRef<Partial<Record<VoiceProgressTopic, string>>>({});
  const propertyDealRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("call");
  const [status, setStatus] = useState<VoiceSessionStatus>("connecting");
  const [caption, setCaption] = useState<{
    role: "user" | "assistant";
    text: string;
  } | null>(null);
  const [progress, setProgress] = useState<
    Partial<Record<VoiceProgressTopic, string>>
  >({});
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingAddress, setOpeningAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      if (!completingRef.current) {
        sessionRef.current?.stop({ discard: true });
        sessionRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let propertyNavTimer: number | undefined;
    completingRef.current = false;
    progressRef.current = {};
    propertyDealRef.current = null;
    setPhase("call");
    setStatus("connecting");
    setCaption(null);
    setProgress({});
    setMuted(false);
    setError(null);
    setOpeningAddress(null);

    void (async () => {
      try {
        const handle = await startVoiceSession((ev) => {
          if (cancelled) return;
          if (ev.type === "status") setStatus(ev.status);
          if (ev.type === "caption") {
            setCaption({ role: ev.role, text: ev.text });
          }
          if (ev.type === "progress") {
            progressRef.current = {
              ...progressRef.current,
              [ev.topic]: ev.label ?? ev.topic,
            };
            setProgress(progressRef.current);
          }
          if (ev.type === "property_found") {
            propertyDealRef.current = ev.dealId;
            completingRef.current = true;
            setOpeningAddress(ev.address ?? null);
            setPhase("opening_deal");
            if (propertyNavTimer != null) window.clearTimeout(propertyNavTimer);
            // Let the model speak a short confirm, then open the deal.
            propertyNavTimer = window.setTimeout(() => {
              sessionRef.current?.stop({ discard: true });
              sessionRef.current = null;
              onOpenChange(false);
              router.push(`/deals/${ev.dealId}`);
            }, 2800);
          }
          if (ev.type === "error") {
            setError(ev.message);
            setPhase("error");
          }
          if (ev.type === "finished") {
            if (propertyDealRef.current) {
              // Property handoff already navigating — ignore intake finish.
              return;
            }
            const text = formatVoiceTranscriptForParse(handle.getTranscript(), {
              summary: ev.summary,
              progress: progressRef.current,
            });
            sessionRef.current = null;
            void completeWithTranscript(text);
          }
        });
        if (cancelled) {
          handle.stop({ discard: true });
          return;
        }
        sessionRef.current = handle;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (propertyNavTimer != null) window.clearTimeout(propertyNavTimer);
      // Don't discard while navigating to the project form after a real finish.
      if (!completingRef.current) {
        sessionRef.current?.stop({ discard: true });
        sessionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function completeWithTranscript(text: string) {
    if (completingRef.current) return;
    completingRef.current = true;

    const trimmed = text.trim();
    if (!trimmed) {
      completingRef.current = false;
      setError("No speech captured. Try again or type your goals.");
      setPhase("error");
      return;
    }

    setPhase("finishing");

    if (completionMode === "handoff") {
      onTranscript?.(trimmed);
      onOpenChange(false);
      return;
    }

    try {
      sessionStorage.setItem(VOICE_TRANSCRIPT_KEY, trimmed);
    } catch {
      /* private mode — still navigate with query fallback length-limited */
    }
    onOpenChange(false);
    router.push("/projects/new?from=voice");
  }

  function hangUp() {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
      return;
    }
    onOpenChange(false);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    sessionRef.current?.setMuted(next);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-6">
      <div
        className="relative w-full sm:max-w-md bg-surface border border-border shadow-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6"
        role="dialog"
        aria-modal
        aria-label="Papuc Voice Concierge"
      >
        <button
          type="button"
          onClick={() => {
            sessionRef.current?.stop({ discard: true });
            sessionRef.current = null;
            onOpenChange(false);
          }}
          className="absolute right-4 top-4 text-textMuted hover:text-text"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {phase === "error" ? (
          <div className="pt-2 text-center space-y-4">
            <h2 className="text-xl font-bold">Couldn’t finish the call</h2>
            <p className="text-danger text-sm">{error}</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
              <Button asChild variant="secondary">
                <Link href="/projects/new" onClick={() => onOpenChange(false)}>
                  Type goals instead
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-2 pb-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-1">
              {variant === "first_run"
                ? "Welcome to Papuc"
                : "Papuc Concierge"}
            </p>
            <h2 className="text-xl font-bold text-text mb-1">
              {phase === "opening_deal"
                ? "Opening that property…"
                : phase === "finishing"
                  ? "Turning that into a project…"
                  : status === "connecting"
                    ? "Connecting…"
                    : status === "speaking"
                      ? "Papuc is speaking"
                      : "Listening"}
            </h2>
            <p className="text-textMuted text-sm mb-5">
              {phase === "opening_deal"
                ? openingAddress
                  ? `Found ${openingAddress}`
                  : "Pulling up the deal page."
                : phase === "finishing"
                  ? "Drafting scout filters from your conversation."
                  : "Rant freely — we’ll ask only what’s missing. Or name a specific address."}
            </p>

            <div
              className={cn(
                "mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full border-2",
                status === "speaking"
                  ? "border-primary bg-primary/15 animate-pulse"
                  : status === "listening"
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-surfaceAlt",
              )}
            >
              {phase === "finishing" ||
              phase === "opening_deal" ||
              status === "connecting" ? (
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              ) : muted ? (
                <MicOff className="h-10 w-10 text-textMuted" />
              ) : (
                <Mic className="h-10 w-10 text-primary" />
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 mb-4 min-h-6">
              {(["place", "budget", "use"] as const).map((topic) => (
                <span
                  key={topic}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    progress[topic]
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border text-textMuted",
                  )}
                >
                  {progress[topic] ?? topic}
                </span>
              ))}
            </div>

            {caption ? (
              <p className="text-sm text-text leading-5 min-h-12 mb-5 px-2">
                <span className="text-textMuted text-[10px] uppercase tracking-wide font-semibold block mb-1">
                  {caption.role === "user" ? "You" : "Papuc"}
                </span>
                {caption.text}
              </p>
            ) : (
              <div className="min-h-12 mb-5" />
            )}

            {phase === "call" ? (
              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={hangUp}
                  className="px-5"
                >
                  <PhoneOff className="h-4 w-4" />
                  End
                </Button>
              </div>
            ) : null}

            <p className="text-textMuted text-[11px] mt-4">
              Prefer typing?{" "}
              <Link
                href="/projects/new"
                className="text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                Open new project form
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function VoiceConciergeTrigger({
  onClick,
  className,
  label = "Talk to Papuc",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surfaceAlt/60 text-textMuted hover:text-primary hover:border-primary/40 transition-colors",
        className,
      )}
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
