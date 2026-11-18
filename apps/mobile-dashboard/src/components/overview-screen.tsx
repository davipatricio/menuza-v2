import type { PanelCouponSummary, PanelOrder } from "@menuza/api-client/model";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrderCard } from "@/components/order-card.tsx";
import { PressableScale } from "@/components/pressable.tsx";
import { EmptyState } from "@/components/screen.tsx";
import { usePanelProducts } from "@/lib/catalog.ts";
import { useOrders } from "@/lib/orders.ts";
import { useCouponSummaries } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

const RECENT_ORDER_COUNT = 5;

const UNKNOWN_VALUE = "—";

/** `undefined` while the read has not answered, a real number once it has. */
function kpiValue(count: number | undefined): string {
  return count === undefined ? UNKNOWN_VALUE : String(count);
}

/** One number of the 2×2 grid; tapping it opens the screen that owns it. */
function KpiCard({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    // `PressableScale` renders a plain wrapper, so the flex item is this view.
    <View className="flex-1">
      <PressableScale
        accessibilityLabel={
          value === UNKNOWN_VALUE ? `${label}: aguardando dados` : `${label}: ${value}`
        }
        className="min-h-[104px] justify-between gap-3 rounded-2xl border border-border bg-card p-4"
        onPress={onPress}
      >
        <Text className="text-3xl font-bold tracking-tight text-card-foreground tabular-nums">
          {value}
        </Text>
        <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      </PressableScale>
    </View>
  );
}

/** One failed read, said once; the numbers stay `—` and this row owns the retry. */
function RefreshError({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-row items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3">
      <Text className="flex-1 py-2.5 text-xs leading-snug text-destructive">
        Não foi possível atualizar o resumo da loja.
      </Text>
      <Pressable
        accessibilityRole="button"
        className="min-h-[44px] justify-center px-2 active:opacity-70"
        hitSlop={8}
        onPress={onRetry}
      >
        <Text className="text-xs font-semibold text-destructive">Tentar novamente</Text>
      </Pressable>
    </View>
  );
}

/** Muted blocks shaped like order cards, so the first paint is not a blank section. */
function RecentOrdersSkeleton() {
  return (
    <View className="gap-2.5">
      <View className="h-[104px] rounded-2xl bg-muted" />
      <View className="h-[104px] rounded-2xl bg-muted" />
      <View className="h-[104px] rounded-2xl bg-muted" />
    </View>
  );
}

/** The latest orders, five at most; a tap opens the order. */
function RecentOrders({
  isPending,
  isError,
  orders,
}: {
  isPending: boolean;
  isError: boolean;
  orders: PanelOrder[];
}) {
  const router = useRouter();

  if (isPending) return <RecentOrdersSkeleton />;

  if (isError && orders.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground">Pedidos recentes indisponíveis agora.</Text>
    );
  }

  if (orders.length === 0) {
    return <EmptyState title="Nenhum pedido ainda" message="Os pedidos da loja aparecem aqui." />;
  }

  return (
    <View className="gap-2.5">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onPress={() => router.push(`/order/${order.code}`)}
        />
      ))}
    </View>
  );
}

/** `undefined` while the read has not answered, a real number once it has. */
function countOrders(orders: PanelOrder[] | undefined, status: string): number | undefined {
  if (!orders) return undefined;

  return orders.filter((order) => order.fulfilmentStatus === status).length;
}

/** A coupon counts while its derived status is `active`; an expired one never does. */
function countActiveCoupons(coupons: PanelCouponSummary[] | undefined): number | undefined {
  if (!coupons) return undefined;

  return coupons.filter((coupon) => coupon.effectiveStatus === "active").length;
}

/**
 * Início: the store's movement on one screen.
 *
 * The numbers come from the reads the Pedidos tab, the coupon list and the
 * catalog already make, so this screen reuses their cache instead of adding a
 * fourth endpoint. A read that has not answered renders `—`; a failed one is
 * named in a single row with a retry, never as a zero or an empty store.
 */
export function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberships, storeSlug } = useSession();

  const orders = useOrders(storeSlug);
  const coupons = useCouponSummaries(storeSlug);
  const products = usePanelProducts(storeSlug);

  const store = memberships.find((membership) => membership.tenantSlug === storeSlug);

  const pending = countOrders(orders.data, "pending");
  const preparing = countOrders(orders.data, "preparing");
  const activeCoupons = countActiveCoupons(coupons.data);
  const productCount = products.data?.length;

  const recent = (orders.data ?? []).slice(0, RECENT_ORDER_COUNT);
  const failed = orders.isError || coupons.isError || products.isError;

  function refreshAll() {
    void orders.refetch();
    void coupons.refetch();
    void products.refetch();
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={orders.isRefetching || coupons.isRefetching || products.isRefetching}
        />
      }
    >
      <View className="gap-5">
        <View className="gap-1">
          <Text className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {store ? store.tenantName : "Loja selecionada"}
          </Text>
          <Text className="text-2xl font-bold tracking-tight text-foreground">Visão geral</Text>
        </View>

        {failed ? <RefreshError onRetry={refreshAll} /> : null}

        <View className="gap-2.5">
          <View className="flex-row gap-2.5">
            <KpiCard
              label="Pedidos novos"
              onPress={() => router.push("/(tabs)/pedidos")}
              value={kpiValue(pending)}
            />
            <KpiCard
              label="Em preparo"
              onPress={() => router.push("/(tabs)/pedidos")}
              value={kpiValue(preparing)}
            />
          </View>
          <View className="flex-row gap-2.5">
            <KpiCard
              label="Cupons ativos"
              onPress={() => router.push("/management/coupons")}
              value={kpiValue(activeCoupons)}
            />
            <KpiCard
              label="Produtos"
              onPress={() => router.push("/(tabs)/catalogo")}
              value={kpiValue(productCount)}
            />
          </View>
        </View>

        <View className="gap-2.5">
          <Text className="text-sm font-semibold text-foreground">Pedidos recentes</Text>
          <RecentOrders isError={orders.isError} isPending={orders.isPending} orders={recent} />
        </View>
      </View>
    </ScrollView>
  );
}
