"use client";

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
    title: "Describe a deal in plain English",
    body: "Tell Papuc what you're looking for: market, budget, target cashflow. No spreadsheets, no SQL.",
  },
  {
    title: "We translate it into search constraints",
    body: "Claude turns your prompt into structured filters. You can edit anything before saving.",
  },
  {
    title: "We scout MLS + score every match",
    body: "Each candidate gets a full pro-forma (DSCR, IRR, cash-on-cash) ported from Berkeley.xlsx, and a 1-2 sentence rationale.",
  },
  {
    title: "DSCR estimates, not lender quotes",
    body: "Numbers shown are investor underwriting estimates. Always verify with a real DSCR lender before making an offer.",
  },
];

export function OnboardingDialog() {
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
        <DialogFooter className="!mt-6 flex-row justify-end gap-2">
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
          <Button onClick={last ? close : () => setStep((s) => s + 1)}>
            {last ? "Got it" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
