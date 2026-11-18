import { formatBrl } from "@menuza/shared/money";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelKits } from "@/lib/catalog.ts";
import { kitKindLabel } from "@/lib/labels.ts";
import { useSession } from "@/lib/session.tsx";

export default function KitsRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelKits(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Kits" }} />
      <ManagementList
        description="Combinações de pratos vendidas como um item. Toque em um kit para editar o nome, o endereço e o preço."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(kit) => kit.id}
        emptyTitle="Nenhum kit"
        emptyMessage="Os kits montados pela loja aparecem aqui."
        renderItem={(kit) => (
          <ManagementRow
            title={kit.name}
            subtitle={`${kitKindLabel(kit.kind)} · ${formatBrl(kit.baseCents)}`}
            meta={`${kit.itemsCount} itens`}
            onPress={() => router.push(`/management/catalog/kits/${kit.id}/edit`)}
          />
        )}
      />
    </View>
  );
}
