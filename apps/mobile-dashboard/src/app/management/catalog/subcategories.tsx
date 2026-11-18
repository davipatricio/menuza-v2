import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { HeaderAction, ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelSubcategories } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

export default function SubcategoriesRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelSubcategories(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Subcategorias",
          headerRight: () => (
            <HeaderAction
              label="Nova subcategoria"
              onPress={() => router.push("/management/catalog/taxonomy/subcategories/new")}
            />
          ),
        }}
      />
      <ManagementList
        description="Subcategorias dentro de cada categoria. Toque em uma subcategoria para editar."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(subcategory) => subcategory.id}
        emptyTitle="Nenhuma subcategoria"
        emptyMessage="As subcategorias da loja aparecem aqui."
        renderItem={(subcategory) => (
          <ManagementRow
            title={subcategory.name}
            subtitle={subcategory.categoryName}
            meta={subcategory.active ? "Ativa" : "Inativa"}
            onPress={() =>
              router.push(`/management/catalog/taxonomy/subcategories/${subcategory.id}`)
            }
          />
        )}
      />
    </View>
  );
}
