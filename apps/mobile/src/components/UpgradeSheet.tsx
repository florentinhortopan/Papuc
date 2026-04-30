import { Modal, Text, View } from "react-native";

import { Button } from "@/components/Button";

export function UpgradeSheet({
  open,
  onClose,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  feature: string;
}) {
  return (
    <Modal visible={open} transparent animationType="fade">
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-surface border-t border-border rounded-t-3xl p-6 pb-10">
          <Text className="text-text text-xl font-bold mb-2">Papuc Pro</Text>
          <Text className="text-textMuted text-sm mb-4">{feature}</Text>
          <View className="bg-surfaceAlt border border-border rounded-2xl p-4 mb-4">
            <Text className="text-text font-semibold mb-2">Pro includes</Text>
            <Bullet>Background scouting (nightly per project)</Bullet>
            <Bullet>Push notifications for new high-score deals</Bullet>
            <Bullet>Side-by-side comparing 3+ deals</Bullet>
            <Bullet>PDF / CSV pro-forma export</Bullet>
            <Bullet>Priority MLS rate limits</Bullet>
          </View>
          <Text className="text-textMuted text-xs mb-4">
            Subscriptions are managed via the App Store / Play Store. RevenueCat
            integration is wired in a follow-up; for now this is a placeholder.
          </Text>
          <View className="flex-row gap-2">
            <Button label="Maybe later" variant="ghost" onPress={onClose} className="flex-1" />
            <Button label="Coming soon" variant="primary" disabled className="flex-1" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View className="flex-row mb-1">
      <Text className="text-primary mr-2">•</Text>
      <Text className="text-text text-sm flex-1">{children}</Text>
    </View>
  );
}
