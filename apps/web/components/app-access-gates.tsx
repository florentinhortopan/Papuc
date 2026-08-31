"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LegalAcceptDialog } from "@/components/legal-accept-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { hasAcceptedCurrentLegal } from "@/lib/legal";
import { getProfile, markOnboarded } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

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
    title: "We scout candidates and score every match",
    body: "Each candidate gets a full pro-forma (DSCR, IRR, cash-on-cash) and a short rationale. Listing data comes from third-party and public sources—not an official MLS feed.",
  },
  {
    title: "DSCR estimates, not lender quotes",
    body: "Numbers shown are investor underwriting estimates. Always verify with a real DSCR lender before making an offer. Papuc is not a brokerage.",
  },
];

/**
 * Legal acceptance first (blocking), then product onboarding.
 * Replaces the old OnboardingDialog-only mount in the app layout.
 */
export function AppAccessGates() {
  const router = useRouter();
  const [legalOk, setLegalOk] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [step, setStep] = useState(0);

  const refreshGates = useCallback(async () => {
    const supabase = createClient();
    const profile = await getProfile(supabase);
    const ok = hasAcceptedCurrentLegal(profile);
    setLegalOk(ok);
    setLegalChecked(true);
    if (ok && profile && !profile.onboarded_at) {
      setOnboardingOpen(true);
    }
  }, []);

  useEffect(() => {
    void refreshGates();
  }, [refreshGates]);

  async function closeOnboarding() {
    setOnboardingOpen(false);
    const supabase = createClient();
    await markOnboarded(supabase).catch(() => {});
  }

  async function startTalking() {
    await closeOnboarding();
    router.push("/home?talk=1");
  }

  async function typeInstead() {
    await closeOnboarding();
    router.push("/projects/new");
  }

  const last = step === STEPS.length - 1;
  const current = STEPS[step]!;

  return (
    <>
      {legalChecked && !legalOk ? (
        <LegalAcceptDialog
          onAccepted={() => {
            setLegalOk(true);
            void refreshGates();
          }}
        />
      ) : null}

      {legalChecked && legalOk ? (
        <Dialog
          open={onboardingOpen}
          onOpenChange={(o) => {
            if (!o) void closeOnboarding();
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
                <Button variant="ghost" onClick={() => void closeOnboarding()}>
                  Skip
                </Button>
              )}
              {last ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void typeInstead()}
                  >
                    I’ll type instead
                  </Button>
                  <Button onClick={() => void startTalking()}>
                    Talk to Papuc
                  </Button>
                </>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
