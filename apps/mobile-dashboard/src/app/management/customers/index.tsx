import { formatBrl } from "@menuza/shared/money";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import { ManagementList, ManagementRow } from "@/components/management.tsx";
import { useCustomers } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/** Who already bought in the store, with their order count and total spent. */
export default function CustomersRoute() {
  const router = useRouter();
  const { storeSlug } = useSession();
  const customers = useCustomers(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Clientes" }} />
      <ManagementList
        description="Quem já comprou na loja, quantos pedidos fez e quanto gastou."
        data={customers.data ?? []}
        isPending={customers.isPending}
        isRefetching={customers.isRefetching}
        onRefresh={() => void customers.refetch()}
        keyExtractor={(customer) => customer.id}
        emptyTitle="Nenhum cliente"
        emptyMessage="Quando alguém comprar na loja, o cadastro aparece nesta lista."
        renderItem={(customer) => (
          <ManagementRow
            title={customer.name}
            subtitle={`${customer.email} · ${formatBrl(customer.totalSpentCents)}`}
            meta={`${customer.ordersCount} ${customer.ordersCount === 1 ? "pedido" : "pedidos"}`}
            onPress={() => router.push(`/management/customers/${customer.id}`)}
          />
        )}
      />
    </View>
  );
}
