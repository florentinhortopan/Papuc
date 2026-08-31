import { Image, View } from "react-native";

import { PapucMark } from "@/components/PapucMark";

const SIZE = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
} as const;

const MARK = {
  xs: 14,
  sm: 18,
  md: 20,
  lg: 28,
  xl: 36,
} as const;

export function UserAvatar({
  url,
  size = "sm",
}: {
  url?: string | null;
  size?: keyof typeof SIZE;
}) {
  const dim = SIZE[size];
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel="Profile photo"
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: "#1a1a22",
        }}
      />
    );
  }

  return (
    <View
      accessibilityLabel="Papuc"
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(124,92,255,0.15)",
        borderWidth: 1,
        borderColor: "rgba(124,92,255,0.25)",
      }}
    >
      <PapucMark size={MARK[size]} />
    </View>
  );
}
