import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { formatDate, formatMarket, formatMoney } from "@/lib/format";
import { listProjects, type ProjectRow } from "@/lib/projects";

export default function ProjectsIndex() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listProjects();
      setProjects(rows);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className="text-text text-3xl font-bold">Projects</Text>
          <Text className="text-textMuted text-sm mt-1">
            Describe a deal you want; let the agent scout it.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/projects/new")}
          className="bg-primary rounded-full w-12 h-12 items-center justify-center active:opacity-80"
        >
          <Text className="text-primaryFg text-3xl leading-9">+</Text>
        </Pressable>
      </View>

      {error ? (
        <View className="mx-6 my-2 bg-danger/10 border border-danger/30 rounded-xl p-3">
          <Text className="text-danger text-xs">{error}</Text>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={projects}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#7c5cff" />
        }
        ListEmptyComponent={
          loading ? null : (
            <View className="items-center mt-16 px-6">
              <Text className="text-textMuted text-base text-center">
                No projects yet. Tap + to describe what you're looking for.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <ProjectListItem project={item} />}
      />
    </SafeAreaView>
  );
}

function ProjectListItem({ project }: { project: ProjectRow }) {
  const router = useRouter();
  const marketLabel = formatMarket(project.constraints.markets[0]);
  const priceMax = project.constraints.priceMax;
  const target = project.constraints.targetMonthlyCashflow;

  return (
    <Card onPress={() => router.push({ pathname: "/(tabs)/projects/[id]", params: { id: project.id } })}>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-text text-lg font-semibold flex-1" numberOfLines={1}>
          {project.name}
        </Text>
        <Text className="text-textMuted text-xs ml-2 capitalize">{project.status}</Text>
      </View>
      <Text className="text-textMuted text-sm mb-2" numberOfLines={2}>
        {project.raw_prompt}
      </Text>
      <View className="flex-row flex-wrap gap-2 mt-1">
        <Tag label={marketLabel} />
        <Tag label={project.constraints.strategy} />
        {priceMax ? <Tag label={`≤ ${formatMoney(priceMax)}`} /> : null}
        {target ? <Tag label={`${formatMoney(target)}/mo`} /> : null}
        <Tag label={`DSCR ≥ ${project.constraints.minDSCR.toFixed(2)}`} />
      </View>
      {project.last_scout_at ? (
        <Text className="text-textMuted text-xs mt-3">
          Last scout {formatDate(project.last_scout_at)}
        </Text>
      ) : null}
    </Card>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View className="bg-surfaceAlt border border-border rounded-full px-2 py-1">
      <Text className="text-text text-xs">{label}</Text>
    </View>
  );
}
