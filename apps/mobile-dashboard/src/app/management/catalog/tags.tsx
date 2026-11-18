import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { HeaderAction, ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelTags } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

export default function TagsRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelTags(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Tags",
          headerRight: () => (
            <HeaderAction
              label="Nova tag"
              onPress={() => router.push("/management/catalog/taxonomy/tags/new")}
            />
          ),
        }}
      />
      <ManagementList
        description="Marcadores livres aplicados aos produtos. Toque em uma tag para editar."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(tag) => tag.id}
        emptyTitle="Nenhuma tag"
        emptyMessage="As tags da loja aparecem aqui."
        renderItem={(tag) => (
          <ManagementRow
            title={tag.name}
            meta={tag.isActive ? "Ativa" : "Inativa"}
            onPress={() => router.push(`/management/catalog/taxonomy/tags/${tag.id}`)}
          />
        )}
      />
    </View>
  );
}
