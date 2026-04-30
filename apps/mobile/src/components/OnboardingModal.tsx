import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
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

export function OnboardingModal() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!session) return;
    void (async () => {
      const profile = await getProfile();
      if (cancelled) return;
      if (profile && !profile.onboarded_at) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function close() {
    setOpen(false);
    await markOnboarded().catch(() => {});
  }

  const last = step === STEPS.length - 1;
  const current = STEPS[step]!;

  return (
    <Modal visible={open} animationType="fade" transparent>
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-surface border-t border-border rounded-t-3xl p-6 pb-10">
          <View className="flex-row gap-1 mb-5">
            {STEPS.map((_, i) => (
              <View
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-surfaceAlt"}`}
              />
            ))}
          </View>
          <Text className="text-text text-2xl font-bold mb-2">{current.title}</Text>
          <Text className="text-textMuted text-sm leading-6 mb-6">{current.body}</Text>

          <View className="flex-row gap-2">
            {step > 0 ? (
              <Button
                label="Back"
                variant="ghost"
                onPress={() => setStep((s) => Math.max(0, s - 1))}
                className="flex-1"
              />
            ) : (
              <Button label="Skip" variant="ghost" onPress={close} className="flex-1" />
            )}
            <Button
              label={last ? "Got it" : "Next"}
              onPress={last ? close : () => setStep((s) => s + 1)}
              className="flex-1"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
