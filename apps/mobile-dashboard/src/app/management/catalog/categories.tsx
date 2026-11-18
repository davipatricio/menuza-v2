import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { HeaderAction, ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelCategories } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

export default function CategoriesRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelCategories(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Categorias",
          headerRight: () => (
            <HeaderAction
              label="Nova categoria"
              onPress={() => router.push("/management/catalog/taxonomy/categories/new")}
            />
          ),
        }}
      />
      <ManagementList
        description="Categorias dentro dos departamentos. Toque em uma categoria para editar."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(category) => category.id}
        emptyTitle="Nenhuma categoria"
        emptyMessage="As categorias da loja aparecem aqui."
        renderItem={(category) => (
          <ManagementRow
            title={category.name}
            subtitle={
              category.departmentNames.length > 0 ? category.departmentNames.join(" · ") : undefined
            }
            meta={category.active ? "Ativa" : "Inativa"}
            onPress={() => router.push(`/management/catalog/taxonomy/categories/${category.id}`)}
          />
        )}
      />
    </View>
  );
}
