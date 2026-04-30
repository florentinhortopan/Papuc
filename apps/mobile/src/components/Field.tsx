import { Text, TextInput, View } from "react-native";

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  hint,
  className,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "email-address";
  hint?: string;
  className?: string;
}) {
  return (
    <View className={`mb-3 ${className ?? ""}`}>
      <Text className="text-textMuted text-xs mb-1">{label}</Text>
      <TextInput
        className="bg-surfaceAlt border border-border rounded-xl px-4 py-3 text-text"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6e6e7a"
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
      {hint ? <Text className="text-textMuted text-xs mt-1">{hint}</Text> : null}
    </View>
  );
}
