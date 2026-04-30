import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      className={focused ? "text-primary text-xs font-semibold" : "text-textMuted text-xs"}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#16161d",
          borderTopColor: "#2a2a36",
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Projects" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Portfolio" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="lenders"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Lenders" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
