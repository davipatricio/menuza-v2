import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { HeaderAction, ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelBadges } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

export default function BadgesRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelBadges(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Etiquetas",
          headerRight: () => (
            <HeaderAction
              label="Nova etiqueta"
              onPress={() => router.push("/management/catalog/taxonomy/badges/new")}
            />
          ),
        }}
      />
      <ManagementList
        description="Selos com imagem exibidos no produto. Toque em uma etiqueta para editar."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(badge) => badge.id}
        emptyTitle="Nenhuma etiqueta"
        emptyMessage="As etiquetas da loja aparecem aqui."
        renderItem={(badge) => (
          <ManagementRow
            title={badge.name}
            meta={badge.isActive ? "Ativa" : "Inativa"}
            onPress={() => router.push(`/management/catalog/taxonomy/badges/${badge.id}`)}
          />
        )}
      />
    </View>
  );
}
