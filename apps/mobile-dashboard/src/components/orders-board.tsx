import type { PanelOrder } from "@menuza/api-client/model";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrderCard } from "@/components/order-card.tsx";
import { EmptyState, Page } from "@/components/screen.tsx";
import { SegmentedControl } from "@/components/segmented-control.tsx";
import { useAlert } from "@/lib/alert.tsx";
import { useOrders } from "@/lib/orders.ts";
import { useSession } from "@/lib/session.tsx";

type Queue = "pending" | "preparing" | "ready" | "history";

interface QueueDefinition {
  label: string;
  statuses: readonly string[];
  description: string;
  emptyTitle: string;
  emptyMessage: string;
}

const QUEUE_ORDER: readonly Queue[] = ["pending", "preparing", "ready", "history"];

/**
 * The four queues of one board. A segment is a filter, never a second data
 * source: `ready` also carries `ready_for_pickup`, and `history` carries both
 * closed states, so the operator never hunts for a finished order.
 */
const QUEUES = {
  pending: {
    label: "Novos",
    statuses: ["pending"],
    description: "Pedidos recém-chegados, ainda sem confirmação.",
    emptyTitle: "Nenhum pedido novo",
    emptyMessage: "Quando um pedido entrar, ele aparece aqui e o alarme toca.",
  },
  preparing: {
    label: "Preparo",
    statuses: ["preparing"],
    description: "Pedidos aceitos e na cozinha.",
    emptyTitle: "Nada em preparo",
    emptyMessage: "Pedidos em preparo aparecem aqui para a cozinha.",
  },
  ready: {
    label: "Prontos",
    statuses: ["ready", "ready_for_pickup"],
    description: "Pedidos prontos, aguardando retirada.",
    emptyTitle: "Nada pronto",
    emptyMessage: "Pedidos prontos aparecem aqui até a retirada.",
  },
  history: {
    label: "Histórico",
    statuses: ["completed", "canceled"],
    description: "Pedidos concluídos e cancelados.",
    emptyTitle: "Nenhum pedido no histórico",
    emptyMessage: "Pedidos concluídos e cancelados ficam guardados aqui.",
  },
} satisfies Record<Queue, QueueDefinition>;

function countOrders(orders: readonly PanelOrder[], statuses: readonly string[]): number {
  return orders.filter((order) => statuses.includes(order.fulfilmentStatus)).length;
}

/**
 * The order board: one query, one list, four segments. Moving between segments
 * only filters the fetched orders, so a new order lands in Novos on the next
 * poll without the other queues refetching.
 */
export function OrdersBoard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storeSlug } = useSession();
  const { alarming } = useAlert();
  const query = useOrders(storeSlug);
  const [queue, setQueue] = useState<Queue>("pending");

  const allOrders = query.data ?? [];
  const definition = QUEUES[queue];
  const orders = allOrders.filter((order) => definition.statuses.includes(order.fulfilmentStatus));

  const segments = QUEUE_ORDER.map((value) => ({
    value,
    label: QUEUES[value].label,
    count: countOrders(allOrders, QUEUES[value].statuses),
  }));

  return (
    <Page>
      <View className="gap-1 px-4 pt-4">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="text-2xl font-semibold text-foreground">Pedidos</Text>
          {alarming ? <SilenceToggle /> : null}
        </View>
        <Text className="text-sm text-muted-foreground">{definition.description}</Text>
      </View>

      <View className="px-4 pt-3 pb-3">
        <SegmentedControl onChange={setQueue} options={segments} value={queue} />
      </View>

      <FlashList
        data={orders}
        keyExtractor={(order) => order.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListEmptyComponent={
          <View className="px-4">
            <EmptyState
              title={query.isPending ? "Carregando…" : definition.emptyTitle}
              message={query.isPending ? "Buscando os pedidos da loja." : definition.emptyMessage}
            />
          </View>
        }
        renderItem={({ item }) => (
          <View className="px-4 pb-2">
            <OrderCard order={item} onPress={() => router.push(`/order/${item.code}`)} />
          </View>
        )}
      />
    </Page>
  );
}

/** Silencing only makes sense while the alarm rings; the board decides that. */
function SilenceToggle() {
  const { silenced, toggle } = useAlert();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: silenced }}
      className="min-h-[44px] justify-center rounded-xl border border-border bg-card px-3 py-2 active:opacity-80"
      onPress={toggle}
    >
      <Text className="text-xs font-medium text-foreground">
        {silenced ? "Retomar som" : "Parar som"}
      </Text>
    </Pressable>
  );
}
