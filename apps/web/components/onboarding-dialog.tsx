"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { getProfile, markOnboarded } from "@/lib/profile";

const STEPS = [
  {
    title: "Talk to Papuc about what you want",
    body: "Rant freely into the mic — market, budget, live vs rent, land, lifestyle. The Concierge listens carefully and only asks what’s missing.",
  },
  {
    title: "We turn the conversation into scout filters",
    body: "Your call becomes editable constraints. Tweak anything before we start scouting.",
  },
  {
    title: "We scout MLS + score every match",
    body: "Each candidate gets a full pro-forma (DSCR, IRR, cash-on-cash) and a short rationale.",
  },
  {
    title: "DSCR estimates, not lender quotes",
    body: "Numbers shown are investor underwriting estimates. Always verify with a real DSCR lender before making an offer.",
  },
];

export function OnboardingDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const profile = await getProfile(supabase);
      if (cancelled) return;
      if (profile && !profile.onboarded_at) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function close() {
    setOpen(false);
    const supabase = createClient();
    await markOnboarded(supabase).catch(() => {});
  }

  async function startTalking() {
    await close();
    router.push("/home?talk=1");
  }

  async function typeInstead() {
    await close();
    router.push("/projects/new");
  }

  const last = step === STEPS.length - 1;
  const current = STEPS[step]!;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) void close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div className="flex gap-1 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-primary" : "bg-surfaceAlt"
              }`}
            />
          ))}
        </div>
        <DialogTitle className="text-2xl">{current.title}</DialogTitle>
        <DialogDescription className="text-sm leading-6 mt-2">
          {current.body}
        </DialogDescription>
        <DialogFooter className="!mt-6 flex-row flex-wrap justify-end gap-2">
          {step > 0 ? (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={close}>
              Skip
            </Button>
          )}
          {last ? (
            <>
              <Button variant="secondary" onClick={() => void typeInstead()}>
                I’ll type instead
              </Button>
              <Button onClick={() => void startTalking()}>Talk to Papuc</Button>
            </>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
