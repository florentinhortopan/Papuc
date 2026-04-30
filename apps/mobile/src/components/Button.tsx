import { ActivityIndicator, Pressable, Text } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  className,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  className?: string;
}) {
  const base = "rounded-xl py-3 px-4 items-center";
  const styles: Record<Variant, string> = {
    primary: "bg-primary",
    secondary: "bg-surfaceAlt border border-border",
    ghost: "bg-transparent",
    danger: "bg-danger",
  };
  const textStyles: Record<Variant, string> = {
    primary: "text-primaryFg font-semibold",
    secondary: "text-text font-semibold",
    ghost: "text-textMuted font-semibold",
    danger: "text-white font-semibold",
  };
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${styles[variant]} ${isDisabled ? "opacity-50" : "active:opacity-80"} ${className ?? ""}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" || variant === "ghost" ? "#f5f5f7" : "#fff"} />
      ) : (
        <Text className={textStyles[variant]}>{label}</Text>
      )}
    </Pressable>
  );
}
