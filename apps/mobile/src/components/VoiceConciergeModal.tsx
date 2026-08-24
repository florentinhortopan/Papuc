import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";

import { setLastError } from "@/lib/debug";
import {
  createProject,
  parseProjectPrompt,
} from "@/lib/projects";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Conversational Concierge fallback (text). Same intake path as Voice → parse → project.
 * WebRTC Realtime can replace the mic orb later without changing this shell.
 */
export function VoiceConciergeModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "working">(
    "idle",
  );
  const [chips, setChips] = useState<{ place?: string; budget?: string; use?: string }>(
    {},
  );

  const run = async () => {
    const text = prompt.trim();
    if (!text) return;
    setStatus("working");
    try {
      const constraints = await parseProjectPrompt(
        `Voice Concierge intake (dialogue labeled User / Papuc).\nExtract ProjectConstraints from what the USER said.\nUser: ${text}`,
      );
      const market = constraints.markets?.[0];
      const name =
        market && "city" in market && market.city
          ? `${market.city} scout`
          : "Voice project";
      setChips({
        place: market && "city" in market ? String(market.city) : undefined,
        budget:
          constraints.priceMax != null
            ? `≤ $${Math.round(constraints.priceMax / 1000)}k`
            : undefined,
        use: constraints.strategy,
      });
      const project = await createProject({
        name,
        rawPrompt: text,
        constraints,
      });
      onClose();
      setPrompt("");
      setStatus("idle");
      router.push(`/(tabs)/projects/${project.id}`);
    } catch (e) {
      setLastError(e);
      setStatus("idle");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View className="flex-1 bg-background px-5 pt-16">
        <Text className="text-3xl font-bold text-text">Talk to Papuc</Text>
        <Text className="mt-2 text-base text-textMuted">
          Tell me the market, budget, and how you want to use the property.
        </Text>

        <View className="mt-10 items-center">
          <Pressable
            onPress={() =>
              setStatus((s) => (s === "listening" ? "idle" : "listening"))
            }
            className="h-36 w-36 items-center justify-center rounded-full bg-primary"
            style={{ opacity: status === "listening" ? 1 : 0.85 }}
          >
            <Text className="text-4xl text-white">🎙</Text>
          </Pressable>
          <Text className="mt-4 text-sm text-textMuted">
            {status === "working"
              ? "Creating your project…"
              : status === "listening"
                ? "Listening… (type below for now)"
                : "Tap mic, then type your goals"}
          </Text>
        </View>

        <View className="mt-6 flex-row flex-wrap gap-2">
          {(["place", "budget", "use"] as const).map((k) => (
            <View
              key={k}
              className="rounded-full border border-border bg-surface px-3 py-1.5"
            >
              <Text className="text-xs text-textMuted">
                {k}
                {chips[k] ? `: ${chips[k]}` : ""}
              </Text>
            </View>
          ))}
        </View>

        <TextInput
          className="mt-6 min-h-[120px] rounded-2xl border border-border bg-surface p-4 text-base text-text"
          placeholder="e.g. Austin duplex under 450k, 20% down, LTR, DSCR 1.2+"
          placeholderTextColor="#9aa0aa"
          multiline
          value={prompt}
          onChangeText={setPrompt}
          onFocus={() => setStatus("listening")}
        />

        <View className="mt-auto gap-3 pb-10">
          <Pressable
            onPress={() => void run()}
            disabled={status === "working"}
            className="items-center rounded-xl bg-primary py-4"
          >
            <Text className="font-semibold text-white">Create project</Text>
          </Pressable>
          <Pressable onPress={onClose} className="items-center py-3">
            <Text className="text-textMuted">End</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
