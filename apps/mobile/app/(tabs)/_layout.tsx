import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      className={
        focused ? "text-primary text-xs font-semibold" : "text-textMuted text-xs"
      }
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "rgba(22,22,29,0.96)",
            borderTopColor: "#2a2a36",
            height: 58,
            paddingBottom: 6,
            paddingTop: 6,
          },
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="projects"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Projects" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="portfolio"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Portfolio" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon label="Settings" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="lenders"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}
