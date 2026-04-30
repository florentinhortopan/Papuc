import { Stack } from "expo-router";

export default function ProjectStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0b0b0f" },
      }}
    />
  );
}
