import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { HeaderAction, ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelDepartments } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

export default function DepartmentsRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelDepartments(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Departamentos",
          headerRight: () => (
            <HeaderAction
              label="Novo departamento"
              onPress={() => router.push("/management/catalog/taxonomy/departments/new")}
            />
          ),
        }}
      />
      <ManagementList
        description="Agrupamento de primeiro nível do catálogo. Toque em um departamento para editar."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(department) => department.id}
        emptyTitle="Nenhum departamento"
        emptyMessage="Os departamentos da loja aparecem aqui."
        renderItem={(department) => (
          <ManagementRow
            title={department.name}
            meta={department.active ? "Ativo" : "Inativo"}
            onPress={() => router.push(`/management/catalog/taxonomy/departments/${department.id}`)}
          />
        )}
      />
    </View>
  );
}
