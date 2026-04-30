import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth";

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Redirect href="/(tabs)/projects" />;
  return <Redirect href="/(auth)/sign-in" />;
}
