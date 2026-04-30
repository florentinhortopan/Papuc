import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { LENDERS } from "@/lib/lenders";

export default function LendersScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
        <View className="px-2 mb-4">
          <Text className="text-text text-3xl font-bold">DSCR lenders</Text>
          <Text className="text-textMuted text-sm mt-1">
            Public directory of common DSCR lenders. Always confirm rates and terms
            directly with the lender.
          </Text>
        </View>

        <View className="gap-3">
          {LENDERS.map((l) => (
            <Card key={l.name}>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-text text-lg font-semibold">{l.name}</Text>
                <Text className="text-textMuted text-xs">
                  Min DSCR {l.minDscr.toFixed(2)}
                </Text>
              </View>
              <Text className="text-textMuted text-sm leading-5 mb-3">{l.notes}</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {l.badges.map((b) => (
                  <View
                    key={b}
                    className="bg-surfaceAlt border border-border rounded-full px-2 py-1"
                  >
                    <Text className="text-text text-xs">{b}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => Linking.openURL(l.url)}
                className="bg-primary/15 border border-primary/40 rounded-xl py-2 items-center active:opacity-80"
              >
                <Text className="text-primary text-sm font-semibold">Visit website</Text>
              </Pressable>
            </Card>
          ))}
        </View>

        <Text className="text-textMuted text-[11px] mt-6 px-2 leading-5">
          Disclaimer: DSCR figures shown elsewhere in the app are investor underwriting
          estimates, not lender quotes. Lenders may apply 75% rent factor, vacancy
          adjustments, and other haircuts. Always verify before making an offer.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
