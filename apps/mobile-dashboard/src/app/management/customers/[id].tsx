import type { PanelCustomerOutput } from "@menuza/api-client/model/panelCustomerOutput";
import { formatBrl } from "@menuza/shared/money";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ManagementRow } from "@/components/management.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import { fulfilmentLabel } from "@/lib/labels.ts";
import { formatStamp, useCustomer } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/** One customer, read-only: contact, totals and their orders. */
export default function CustomerDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useSession();
  const customer = useCustomer(storeSlug, id);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: customer.data?.customer.name ?? "Cliente" }} />
      {customer.isPending ? (
        <Loading />
      ) : customer.data ? (
        <CustomerDetail detail={customer.data} />
      ) : (
        <View className="flex-1 justify-center px-4">
          <EmptyState
            title="Cliente indisponível"
            message="Não foi possível carregar este cliente."
          />
        </View>
      )}
    </View>
  );
}

function CustomerDetail({ detail }: { detail: PanelCustomerOutput }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customer = detail.customer;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
      <View className="gap-5">
        <View className="gap-1 rounded-xl border border-border bg-card p-4">
          <Text className="text-xl font-semibold text-card-foreground">{customer.name}</Text>
          <Text className="text-sm text-muted-foreground">
            Ficha do cliente e seu histórico na loja.
          </Text>
        </View>

        <Section title="Contato">
          <Row label="E-mail" value={customer.email} />
          <Row label="Telefone" value={customer.phone === "" ? "Não informado" : customer.phone} />
        </Section>

        <Section title="Histórico">
          <Row label="Pedidos" value={ordersLabel(customer.ordersCount)} />
          <Row label="Total gasto" value={formatBrl(customer.totalSpentCents)} />
        </Section>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Pedidos deste cliente</Text>

          {detail.orders.length === 0 ? (
            <Text className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum pedido deste cliente.
            </Text>
          ) : (
            detail.orders.map((order) => (
              <ManagementRow
                key={order.id}
                title={`#${order.code}`}
                subtitle={`${fulfilmentLabel(order.fulfilmentStatus)} · ${formatStamp(
                  order.createdAt,
                )}`}
                meta={formatBrl(order.totalCents)}
                onPress={() => router.push(`/order/${order.code}`)}
              />
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <View className="gap-2 rounded-xl border border-border bg-card p-4">{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-sm text-card-foreground">{value}</Text>
    </View>
  );
}

function ordersLabel(count: number): string {
  return `${count} ${count === 1 ? "pedido" : "pedidos"}`;
}
