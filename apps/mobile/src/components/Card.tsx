import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

export function Card({
  children,
  className,
  onPress,
}: {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}) {
  const cls = `bg-surface border border-border rounded-2xl p-4 ${className ?? ""}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${cls} active:opacity-80`}>
        {children}
      </Pressable>
    );
  }
  return <View className={cls}>{children}</View>;
}
