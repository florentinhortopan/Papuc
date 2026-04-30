import type { ProjectConstraints } from "@papuc/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { formatMarket } from "@/lib/format";
import {
  createProject,
  parseProjectPrompt,
  type ProjectRow,
} from "@/lib/projects";

const SAMPLE_PROMPTS = [
  "I have $200k down and want $600/month cashflow on single family homes in Austin, TX.",
  "I have $40k in down payments and want to rent a place out for $2,500/month in Phoenix, AZ.",
  "Looking for an Airbnb in Berkeley, CA under $1.1M with 4 beds.",
];

type Step = "prompt" | "review";

export default function NewProject() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<Step>("prompt");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [constraints, setConstraints] = useState<ProjectConstraints | null>(null);
  const [name, setName] = useState("");

  async function parse() {
    if (!prompt.trim()) return;
    setParsing(true);
    try {
      const c = await parseProjectPrompt(prompt);
      setConstraints(c);
      setName(`${c.strategy} in ${formatMarket(c.markets[0])}`);
      setStep("review");
    } catch (err: any) {
      Alert.alert(
        "Couldn't parse prompt",
        err?.message ??
          "Make sure your Supabase Edge Function 'parse-project-goals' is deployed and ANTHROPIC_API_KEY is set.",
      );
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!constraints) return;
    setSaving(true);
    try {
      const row: ProjectRow = await createProject({
        name: name.trim() || "Untitled project",
        rawPrompt: prompt,
        constraints,
      });
      router.replace({ pathname: "/(tabs)/projects/[id]", params: { id: row.id } });
    } catch (err: any) {
      Alert.alert("Couldn't save project", err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  if (step === "prompt") {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <Text className="text-text text-3xl font-bold">New project</Text>
            <Text className="text-textMuted text-sm mt-1 mb-6">
              Describe in plain English what you're looking for. The agent will pull out
              constraints (market, price, beds, cashflow, DSCR target).
            </Text>

            <View className="bg-surface border border-border rounded-2xl p-3 mb-4">
              <TextInput
                className="text-text min-h-32 text-base p-2"
                placeholder="e.g., I have $40k for a down payment and want to rent out a single family home for $2,500/month in Phoenix, AZ."
                placeholderTextColor="#6e6e7a"
                multiline
                value={prompt}
                onChangeText={setPrompt}
                textAlignVertical="top"
              />
            </View>

            <Text className="text-textMuted text-xs mb-2">Try one of these:</Text>
            {SAMPLE_PROMPTS.map((s) => (
              <Card
                key={s}
                className="mb-2"
                onPress={() => setPrompt(s)}
              >
                <Text className="text-text text-sm">{s}</Text>
              </Card>
            ))}

            <Button
              label="Parse goals"
              onPress={parse}
              loading={parsing}
              disabled={!prompt.trim()}
              className="mt-4"
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => router.back()}
              className="mt-2"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
    />
  );
}

function ConstraintReview({
  name,
  setName,
  constraints,
  setConstraints,
  onBack,
  onSave,
  saving,
}: {
  name: string;
  setName: (v: string) => void;
  constraints: ProjectConstraints;
  setConstraints: (c: ProjectConstraints) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const market = constraints.markets[0];
  const cityState =
    market?.kind === "city"
      ? { city: market.city, state: market.state }
      : market?.kind === "county"
        ? { city: "", state: market.state }
        : { city: "", state: "" };

  function setMarketCity(city: string) {
    setConstraints({
      ...constraints,
      markets: [{ kind: "city", city, state: cityState.state || "" }],
    });
  }
  function setMarketState(state: string) {
    setConstraints({
      ...constraints,
      markets: [{ kind: "city", city: cityState.city || "", state: state.toUpperCase() }],
    });
  }
  function patch<K extends keyof ProjectConstraints>(k: K, v: ProjectConstraints[K]) {
    setConstraints({ ...constraints, [k]: v });
  }
  function patchMortgage<K extends keyof ProjectConstraints["mortgage"]>(
    k: K,
    v: ProjectConstraints["mortgage"][K],
  ) {
    setConstraints({ ...constraints, mortgage: { ...constraints.mortgage, [k]: v } });
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text className="text-text text-3xl font-bold">Review constraints</Text>
          <Text className="text-textMuted text-sm mt-1 mb-6">
            The agent extracted these. Tweak anything before saving.
          </Text>

          <Field label="Project name" value={name} onChangeText={setName} />

          <Text className="text-text text-base font-semibold mt-2 mb-2">Market</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="City"
                value={cityState.city ?? ""}
                onChangeText={setMarketCity}
                placeholder="Austin"
              />
            </View>
            <View className="w-24">
              <Field
                label="State"
                value={cityState.state ?? ""}
                onChangeText={setMarketState}
                placeholder="TX"
              />
            </View>
          </View>

          <Text className="text-text text-base font-semibold mt-2 mb-2">Property</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Min beds"
                value={String(constraints.bedsMin ?? "")}
                onChangeText={(v) => patch("bedsMin", v ? Number(v) : undefined)}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Min baths"
                value={String(constraints.bathsMin ?? "")}
                onChangeText={(v) => patch("bathsMin", v ? Number(v) : undefined)}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Min sqft"
                value={String(constraints.sqftMin ?? "")}
                onChangeText={(v) => patch("sqftMin", v ? Number(v) : undefined)}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Min price ($)"
                value={String(constraints.priceMin ?? "")}
                onChangeText={(v) => patch("priceMin", v ? Number(v) : undefined)}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Max price ($)"
                value={String(constraints.priceMax ?? "")}
                onChangeText={(v) => patch("priceMax", v ? Number(v) : undefined)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text className="text-text text-base font-semibold mt-2 mb-2">Capital</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Down payment ($)"
                value={String(constraints.downPayment ?? "")}
                onChangeText={(v) => patch("downPayment", v ? Number(v) : undefined)}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Total cash ($)"
                value={String(constraints.totalCash ?? "")}
                onChangeText={(v) => patch("totalCash", v ? Number(v) : undefined)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text className="text-text text-base font-semibold mt-2 mb-2">Mortgage</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Rate APR (%)"
                value={(constraints.mortgage.rateAPR * 100).toFixed(2)}
                onChangeText={(v) =>
                  patchMortgage("rateAPR", v ? Number(v) / 100 : 0.075)
                }
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Term (years)"
                value={String(constraints.mortgage.termYears)}
                onChangeText={(v) =>
                  patchMortgage("termYears", v ? Number(v) : 30)
                }
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Field
                label="LTV"
                value={constraints.mortgage.ltv.toFixed(2)}
                onChangeText={(v) =>
                  patchMortgage("ltv", v ? Number(v) : 0.75)
                }
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text className="text-text text-base font-semibold mt-2 mb-2">Goals</Text>
          <Field
            label="Target monthly cashflow ($)"
            value={String(constraints.targetMonthlyCashflow ?? "")}
            onChangeText={(v) =>
              patch("targetMonthlyCashflow", v ? Number(v) : undefined)
            }
            keyboardType="numeric"
          />
          <Field
            label="Min DSCR"
            value={constraints.minDSCR.toFixed(2)}
            onChangeText={(v) => patch("minDSCR", v ? Number(v) : 1.0)}
            keyboardType="decimal-pad"
            hint="1.00 = breakeven, 1.25 = best DSCR-loan rates"
          />
          <View className="flex-row gap-2 mb-3">
            {[
              { l: "No-ratio (1.00)", v: 1.0 },
              { l: "Min (1.10)", v: 1.1 },
              { l: "Best rates (1.25)", v: 1.25 },
            ].map((p) => {
              const active = Math.abs(constraints.minDSCR - p.v) < 0.001;
              return (
                <Pressable
                  key={p.v}
                  onPress={() => patch("minDSCR", p.v)}
                  className={`flex-1 rounded-full border px-2 py-2 items-center ${
                    active
                      ? "bg-primary/15 border-primary/60"
                      : "bg-surfaceAlt border-border"
                  } active:opacity-80`}
                >
                  <Text
                    className={`text-xs font-semibold ${active ? "text-primary" : "text-text"}`}
                  >
                    {p.l}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            label="Strategy"
            value={constraints.strategy}
            onChangeText={(v) =>
              patch("strategy", v.toUpperCase() === "STR" ? "STR" : "LTR")
            }
            hint="LTR = long-term rental, STR = Airbnb / short-term"
          />

          <Button
            label="Save project"
            onPress={onSave}
            loading={saving}
            className="mt-4"
          />
          <Button label="Back" variant="ghost" onPress={onBack} className="mt-2" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
