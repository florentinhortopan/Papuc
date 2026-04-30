import {
  computeProForma,
  type ProFormaInputs,
  type Strategy,
} from "@papuc/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CashflowChart } from "@/components/CashflowChart";
import { ComparablesPanel } from "@/components/ComparablesPanel";
import { DSCRBadge } from "@/components/DSCRBadge";
import { Field } from "@/components/Field";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { StrMatrix, defaultStrMatrix, type StrMatrixValue } from "@/components/StrMatrix";
import {
  actOnDeal,
  clearDealAction,
  getDeal,
  type DealWithScore,
} from "@/lib/deals";
import { exportProFormaCsv } from "@/lib/export";
import { formatDscr, formatMoney, formatPct } from "@/lib/format";
import { getProject, type ProjectRow } from "@/lib/projects";

interface ProFormaState {
  price: string;
  downPayment: string;
  improvements: string;
  taxRate: string;
  rateAPR: string;
  termYears: string;
  propertyTaxRatePct: string;
  insuranceMonthly: string;
  hoaMonthly: string;
  pmiRatePct: string;
  utilitiesMonthly: string;
  maintenanceMonthly: string;
  miscMonthly: string;
  monthlyRentLTR: string;
  strategy: Strategy;
}

function toNum(s: string, fallback = 0): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<DealWithScore | null>(null);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [state, setState] = useState<ProFormaState | null>(null);
  const [strMatrix, setStrMatrix] = useState<StrMatrixValue | null>(null);

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const d = await getDeal(id);
      setDeal(d);
      const p = await getProject(d.project_id);
      setProject(p);
      const c = p.constraints;
      const priceForDown = Number(d.price ?? 0);
      const fallbackDown = priceForDown * (1 - c.mortgage.ltv);
      const initialAdr = (Number(d.est_rent ?? 2500) / 30) || 200;
      setStrMatrix(defaultStrMatrix(initialAdr));
      setState({
        price: String(d.price ?? c.priceMax ?? 400000),
        downPayment: String(c.downPayment ?? fallbackDown ?? 0),
        improvements: "0",
        taxRate: "0.30",
        rateAPR: c.mortgage.rateAPR.toFixed(4),
        termYears: String(c.mortgage.termYears),
        propertyTaxRatePct: "0.011",
        insuranceMonthly: "100",
        hoaMonthly: "0",
        pmiRatePct: "0.01",
        utilitiesMonthly: c.strategy === "STR" ? "400" : "0",
        maintenanceMonthly: "100",
        miscMonthly: "100",
        monthlyRentLTR: String(d.est_rent ?? 2500),
        strategy: c.strategy,
      });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  const inputs: ProFormaInputs | null = useMemo(() => {
    if (!state) return null;
    return {
      price: toNum(state.price),
      downPayment: toNum(state.downPayment),
      improvements: toNum(state.improvements),
      taxRate: toNum(state.taxRate, 0.3),
      rateAPR: toNum(state.rateAPR, 0.075),
      termYears: toNum(state.termYears, 30),
      propertyTaxRatePct: toNum(state.propertyTaxRatePct, 0.011),
      insuranceMonthly: toNum(state.insuranceMonthly, 100),
      hoaMonthly: toNum(state.hoaMonthly, 0),
      pmiRatePct: toNum(state.pmiRatePct, 0.01),
      utilitiesMonthly: toNum(state.utilitiesMonthly, 0),
      maintenanceMonthly: toNum(state.maintenanceMonthly, 100),
      miscMonthly: toNum(state.miscMonthly, 100),
      strategy: state.strategy,
      monthlyRentLTR:
        state.strategy === "LTR" ? toNum(state.monthlyRentLTR, 0) : 0,
      monthlyNights: state.strategy === "STR" ? strMatrix?.monthlyNights : undefined,
      monthlyADR: state.strategy === "STR" ? strMatrix?.monthlyADR : undefined,
      monthlyOccupancy:
        state.strategy === "STR" ? strMatrix?.monthlyOccupancy : undefined,
      monthlyAvgStays:
        state.strategy === "STR" ? strMatrix?.monthlyAvgStays : undefined,
    };
  }, [state, strMatrix]);

  const result = useMemo(() => (inputs ? computeProForma(inputs) : null), [inputs]);

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="m-6">
          <Pressable onPress={() => router.back()} className="mb-4">
            <Text className="text-textMuted">← Back</Text>
          </Pressable>
          <Text className="text-danger">{error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!deal || !state || !result || !project) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Text className="text-textMuted m-6">Loading…</Text>
      </SafeAreaView>
    );
  }

  function patch<K extends keyof ProFormaState>(k: K, v: ProFormaState[K]) {
    setState((s) => (s ? { ...s, [k]: v } : s));
  }

  async function save() {
    if (!deal) return;
    setBusy("save");
    try {
      await actOnDeal({
        dealId: deal.id,
        projectId: deal.project_id,
        action: "saved",
      });
      Alert.alert("Saved", "Added to your portfolio.");
      void load();
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    if (!deal) return;
    setBusy("dismiss");
    try {
      await actOnDeal({
        dealId: deal.id,
        projectId: deal.project_id,
        action: "dismissed",
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Couldn't dismiss", err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  }

  async function unsave() {
    if (!deal) return;
    try {
      await clearDealAction({ dealId: deal.id, action: "saved" });
      void load();
    } catch (err: any) {
      Alert.alert("Couldn't update", err?.message ?? String(err));
    }
  }

  async function share() {
    if (!deal || !result) return;
    const lines = [
      `${deal.address ?? "Property"} · ${formatMoney(deal.price ?? 0)}`,
      `${deal.beds ?? "?"} bd · ${deal.baths ?? "?"} ba · ${
        deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : "size unknown"
      }`,
      `DSCR ${formatDscr(result.dscr)} (lender 75% rent: ${formatDscr(result.dscrLenderHaircut)})`,
      `Pre-tax cashflow ${formatMoney(result.annualPreTaxProfit / 12)}/mo`,
      `Cash-on-cash ${formatPct(result.cashOnCashReturn)}`,
      `5-yr IRR ${result.irr5Yr !== null ? formatPct(result.irr5Yr) : "—"}`,
      `Calculated in Papuc.`,
    ];
    await Share.share({ message: lines.join("\n") });
  }

  async function exportCsv() {
    if (!deal || !result) return;
    setBusy("export");
    try {
      await exportProFormaCsv({
        address: deal.address ?? "deal",
        price: Number(deal.price ?? 0),
        beds: deal.beds,
        baths: deal.baths,
        sqft: deal.sqft,
        result,
      });
    } catch (err: any) {
      Alert.alert("Couldn't export", err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  }

  const photos = (() => {
    if (Array.isArray(deal.photos) && deal.photos.length) return deal.photos as string[];
    if (deal.primary_image_url) return [deal.primary_image_url];
    return [];
  })();
  const cardW = Dimensions.get("window").width - 32;
  const isSaved = deal.action === "saved";

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Pressable onPress={() => router.back()} className="mb-3">
          <Text className="text-textMuted">← Back</Text>
        </Pressable>

        <PhotoCarousel photos={photos} cardWidth={cardW} />

        <View className="mt-4 mb-4">
          <Text className="text-text text-xl font-bold">
            {deal.address ?? "Address pending"}
          </Text>
          <Text className="text-textMuted text-sm mt-1">
            {[
              deal.beds ? `${deal.beds} bd` : null,
              deal.baths ? `${deal.baths} ba` : null,
              deal.sqft ? `${Math.round(Number(deal.sqft))} sqft` : null,
              deal.city && deal.state ? `${deal.city}, ${deal.state}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <View className="flex-row gap-2 mt-2 flex-wrap">
            <Tag label={formatMoney(deal.price ?? 0)} tone="strong" />
            <DSCRBadge dscr={result.dscr} />
            <Tag
              label={`${formatMoney(result.annualPreTaxProfit / 12)}/mo`}
              tone={result.annualPreTaxProfit >= 0 ? "success" : "danger"}
            />
            <Tag label={`CoC ${formatPct(result.cashOnCashReturn)}`} />
            {deal.score?.rationale ? null : null}
          </View>
        </View>

        {deal.score?.rationale ? (
          <Card className="mb-3">
            <Text className="text-textMuted text-xs mb-1">Why this matched</Text>
            <Text className="text-text text-sm leading-5">{deal.score.rationale}</Text>
          </Card>
        ) : null}

        <View className="mb-4">
          <CashflowChart
            monthlyPreTaxProfit={result.monthlyPreTaxProfit}
            width={cardW}
          />
        </View>

        <Card className="mb-3">
          <Text className="text-text text-base font-semibold mb-2">Pro-forma summary</Text>
          <SummaryRow label="Initial sunk investment" value={formatMoney(result.initialSunkInvestment)} />
          <SummaryRow label="Annual pre-tax profit" value={formatMoney(result.annualPreTaxProfit)} />
          <SummaryRow label="Annual after-tax profit" value={formatMoney(result.annualPostTaxProfit)} />
          <SummaryRow
            label="Cash-on-cash return"
            value={formatPct(result.cashOnCashReturn)}
          />
          <SummaryRow
            label="Payout (years)"
            value={
              isFinite(result.payoutYears)
                ? result.payoutYears.toFixed(2)
                : "—"
            }
          />
          <SummaryRow
            label="5-yr IRR"
            value={result.irr5Yr !== null ? formatPct(result.irr5Yr) : "—"}
          />
          <SummaryRow
            label="5-yr equity multiple"
            value={result.equityMultiple5Yr.toFixed(2) + "x"}
          />
          <SummaryRow label="DSCR" value={formatDscr(result.dscr)} />
          <SummaryRow
            label="DSCR (lender 75% rent)"
            value={formatDscr(result.dscrLenderHaircut)}
          />
          <SummaryRow
            label="Monthly PITIA"
            value={formatMoney(result.pitiaMonthly.total)}
          />
        </Card>

        <Card className="mb-3">
          <Text className="text-text text-base font-semibold mb-2">Inputs</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Price ($)" value={state.price} onChangeText={(v) => patch("price", v)} keyboardType="numeric" />
            </View>
            <View className="flex-1">
              <Field label="Down ($)" value={state.downPayment} onChangeText={(v) => patch("downPayment", v)} keyboardType="numeric" />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Rate APR (decimal)" value={state.rateAPR} onChangeText={(v) => patch("rateAPR", v)} keyboardType="decimal-pad" hint="e.g. 0.075 = 7.5%" />
            </View>
            <View className="flex-1">
              <Field label="Term (yrs)" value={state.termYears} onChangeText={(v) => patch("termYears", v)} keyboardType="numeric" />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Tax rate" value={state.taxRate} onChangeText={(v) => patch("taxRate", v)} keyboardType="decimal-pad" hint="On rental profits" />
            </View>
            <View className="flex-1">
              <Field label="Prop tax %/yr" value={state.propertyTaxRatePct} onChangeText={(v) => patch("propertyTaxRatePct", v)} keyboardType="decimal-pad" hint="Berkeley default 0.011" />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Insurance ($/mo)" value={state.insuranceMonthly} onChangeText={(v) => patch("insuranceMonthly", v)} keyboardType="numeric" />
            </View>
            <View className="flex-1">
              <Field label="HOA ($/mo)" value={state.hoaMonthly} onChangeText={(v) => patch("hoaMonthly", v)} keyboardType="numeric" />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="PMI %/yr" value={state.pmiRatePct} onChangeText={(v) => patch("pmiRatePct", v)} keyboardType="decimal-pad" hint="Auto 0 if LTV ≤ 80%" />
            </View>
            <View className="flex-1">
              <Field label="Utilities ($/mo)" value={state.utilitiesMonthly} onChangeText={(v) => patch("utilitiesMonthly", v)} keyboardType="numeric" />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Maintenance ($/mo)" value={state.maintenanceMonthly} onChangeText={(v) => patch("maintenanceMonthly", v)} keyboardType="numeric" />
            </View>
            <View className="flex-1">
              <Field label="Misc ($/mo)" value={state.miscMonthly} onChangeText={(v) => patch("miscMonthly", v)} keyboardType="numeric" />
            </View>
          </View>
          <Field
            label={state.strategy === "STR" ? "Average daily rate ($, applied each month)" : "Monthly rent ($)"}
            value={state.monthlyRentLTR}
            onChangeText={(v) => patch("monthlyRentLTR", v)}
            keyboardType="numeric"
            hint={state.strategy === "STR" ? "We'll multiply by 30 days × 70% occ as a default" : undefined}
          />
          <Field
            label="Strategy"
            value={state.strategy}
            onChangeText={(v) => patch("strategy", v.toUpperCase() === "STR" ? "STR" : "LTR")}
            hint="LTR or STR"
          />
        </Card>

        {state.strategy === "STR" && strMatrix ? (
          <View className="mb-3">
            <StrMatrix value={strMatrix} onChange={setStrMatrix} />
          </View>
        ) : null}

        <View className="my-3">
          <ComparablesPanel dealId={deal.id} />
        </View>

        <View className="flex-row gap-2 mt-2">
          {isSaved ? (
            <Button label="Unsave" variant="secondary" onPress={unsave} className="flex-1" />
          ) : (
            <Button label="Save" onPress={save} loading={busy === "save"} className="flex-1" />
          )}
          <Button label="Share" variant="secondary" onPress={share} className="flex-1" />
        </View>
        <View className="flex-row gap-2 mt-2">
          <Button
            label="Export CSV"
            variant="secondary"
            onPress={exportCsv}
            loading={busy === "export"}
            className="flex-1"
          />
          <Button
            label="Dismiss"
            variant="ghost"
            onPress={dismiss}
            loading={busy === "dismiss"}
            className="flex-1"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-textMuted text-sm">{label}</Text>
      <Text className="text-text text-sm font-semibold">{value}</Text>
    </View>
  );
}

function Tag({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "success" | "danger" | "strong";
}) {
  const cls =
    tone === "success"
      ? "bg-success/10 border-success/30 text-success"
      : tone === "danger"
        ? "bg-danger/10 border-danger/30 text-danger"
        : tone === "strong"
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-surfaceAlt border-border text-text";
  return (
    <View className={`border rounded-full px-2 py-1 ${cls}`}>
      <Text className={`text-xs font-semibold ${cls}`}>{label}</Text>
    </View>
  );
}
