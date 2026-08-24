import BottomSheet from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DealPeekSheet } from "@/components/DealPeekSheet";
import { DebugFooter } from "@/components/DebugFooter";
import { DiscoveryDealCard } from "@/components/DiscoveryDealCard";
import { VoiceConciergeModal } from "@/components/VoiceConciergeModal";
import { setLastError } from "@/lib/debug";
import {
  FEED_CHIPS,
  fetchPersonalizedFeed,
  railDeals,
  type FeedDeal,
  type FeedRailId,
  type PersonalizedFeed,
} from "@/lib/feed";

const EMPTY: PersonalizedFeed = {
  forYou: [],
  newForYou: [],
  basedOnSearches: [],
  bestRated: [],
  mostProfitable: [],
  saved: [],
  skipped: [],
  friends: [],
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [rail, setRail] = useState<FeedRailId>("forYou");
  const [feed, setFeed] = useState<PersonalizedFeed>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<FeedDeal | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchPersonalizedFeed();
      setFeed(data);
    } catch (e) {
      setLastError(e);
      setFeed(EMPTY);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deals = railDeals(feed, rail);

  const openDeal = (d: FeedDeal) => {
    setSelected(d);
    sheetRef.current?.snapToIndex(0);
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-4 pb-2 pt-3">
        <Text className="text-2xl font-bold text-primary">Papuc</Text>
        <Text className="mt-1 text-sm text-textMuted">
          Deals that fit your voice — tap to peek, talk to scout.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-11 px-4"
        contentContainerStyle={{ gap: 8, alignItems: "center" }}
      >
        {FEED_CHIPS.map((c) => {
          const on = c.id === rail;
          return (
            <Pressable
              key={c.id}
              onPress={() => setRail(c.id)}
              className={`rounded-full px-3.5 py-2 ${on ? "bg-primary" : "border border-border bg-surface"}`}
            >
              <Text className={on ? "text-sm font-semibold text-white" : "text-sm text-textMuted"}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7c5cff" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-3"
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#7c5cff"
            />
          }
        >
          {deals.length === 0 ? (
            <View className="mt-16 items-center px-6">
              <Text className="text-center text-lg font-semibold text-text">
                {rail === "friends"
                  ? "No friends deals yet"
                  : "Nothing buzzing yet"}
              </Text>
              <Text className="mt-2 text-center text-textMuted">
                {rail === "friends"
                  ? "Follow an investor or watch a public scout — their finds land here."
                  : "Talk to Papuc to start a scout — new deals will land here."}
              </Text>
              {rail !== "friends" ? (
                <Pressable
                  onPress={() => setVoiceOpen(true)}
                  className="mt-6 rounded-xl bg-primary px-6 py-3"
                >
                  <Text className="font-semibold text-white">Talk to Papuc</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            deals.map((d) => (
              <DiscoveryDealCard
                key={d.id}
                deal={d}
                onPress={() => openDeal(d)}
              />
            ))
          )}
        </ScrollView>
      )}

      <Pressable
        onPress={() => setVoiceOpen(true)}
        className="absolute bottom-24 self-center rounded-full border border-border px-5 py-3.5"
        style={{
          backgroundColor: "rgba(22,22,29,0.92)",
          shadowColor: "#7c5cff",
          shadowOpacity: 0.35,
          shadowRadius: 12,
        }}
      >
        <Text className="text-base font-semibold text-primary">Talk to Papuc</Text>
      </Pressable>

      <DealPeekSheet
        ref={sheetRef}
        deal={selected}
        onClose={() => setSelected(null)}
        onSaved={() => void load()}
        onSkipped={() => void load()}
      />

      <VoiceConciergeModal
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
      />

      <DebugFooter />
    </View>
  );
}
