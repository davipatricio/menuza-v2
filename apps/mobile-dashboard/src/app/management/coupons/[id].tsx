import type { CouponProductScopeMode } from "@menuza/api-client/model/couponProductScopeMode";
import type { PanelCouponDetailOutput } from "@menuza/api-client/model/panelCouponDetailOutput";
import type { PanelCouponSummary } from "@menuza/api-client/model/panelCouponSummary";
import { formatBrl } from "@menuza/shared/money";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/pressable.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import {
  couponDiscount,
  couponStatusLabel,
  formatStamp,
  useCouponDetail,
  useDeleteCoupon,
  useSetCouponStatus,
} from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/**
 * One coupon: the rule, its window, its limits, the redemptions the API
 * returned, and the writes the operator can run without the web panel.
 */
export default function CouponDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useSession();
  const coupon = useCouponDetail(storeSlug, id);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: coupon.data?.coupon.code ?? "Cupom" }} />
      {coupon.isPending ? (
        <Loading />
      ) : coupon.data ? (
        <CouponDetail detail={coupon.data} />
      ) : (
        <View className="flex-1 justify-center px-4">
          <EmptyState title="Cupom indisponível" message="Não foi possível carregar este cupom." />
        </View>
      )}
    </View>
  );
}

function CouponDetail({ detail }: { detail: PanelCouponDetailOutput }) {
  const insets = useSafeAreaInsets();
  const coupon = detail.coupon;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
      <View className="gap-5">
        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-xl font-semibold text-card-foreground">{coupon.code}</Text>
            <Text className="rounded-lg bg-accent px-2 py-1 text-xs text-accent-foreground">
              {couponStatusLabel(coupon.effectiveStatus)}
            </Text>
          </View>
          <Text className="text-sm text-muted-foreground">
            {coupon.description ?? "Cupom sem descrição interna."}
          </Text>
        </View>

        <CouponActions coupon={coupon} />

        <Section title="Desconto">
          <Row label="Regra" value={couponDiscount(coupon)} />
          <Row
            label="Desconto máximo"
            value={moneyValue(coupon.maximumDiscountCents, "Sem teto")}
          />
          <Row label="Pedido mínimo" value={moneyValue(coupon.minimumOrderCents, "Sem mínimo")} />
        </Section>

        <Section title="Validade">
          <Row label="Início" value={stampValue(coupon.startsAt, "Sem data de início")} />
          <Row label="Fim" value={stampValue(coupon.endsAt, "Sem data de fim")} />
        </Section>

        <Section title="Limites">
          <Row label="Usos" value={usageValue(coupon)} />
          <Row label="Por cliente" value={perCustomerValue(coupon.perCustomerLimit)} />
          <Row
            label="Primeira compra"
            value={coupon.firstPurchaseOnly ? "Só na primeira compra" : "Qualquer compra"}
          />
          <Row label="Acumulável" value={coupon.stackable ? "Com outros cupons" : "Não acumula"} />
        </Section>

        <Section title="Aplicação">
          <Row label="Escopo" value={scopeValue(coupon.productScopeMode)} />
          <Row label="Produtos" value={countLabel(detail.products.length, "produto", "produtos")} />
          <Row label="Kits" value={countLabel(coupon.kitIds.length, "kit", "kits")} />
          {detail.products.length === 0 ? null : (
            <View className="flex-row flex-wrap gap-2 pt-1">
              {detail.products.map((product) => (
                <Text
                  key={product.id}
                  className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
                >
                  {product.name}
                </Text>
              ))}
            </View>
          )}
        </Section>

        <RedemptionsSection detail={detail} />
      </View>
    </ScrollView>
  );
}

/**
 * The detail's writes: edit, the status switch and the delete. Activation asks
 * first because it decides whether buyers can use the coupon; deletion asks
 * first because a coupon with redemptions is archived, not erased.
 */
function CouponActions({ coupon }: { coupon: PanelCouponSummary }) {
  const router = useRouter();
  const { storeSlug } = useSession();
  const status = useSetCouponStatus(storeSlug, coupon.id);
  const remove = useDeleteCoupon(storeSlug, coupon.id);
  const [error, setError] = useState<string | null>(null);

  const storedActive = coupon.status === "active";
  const expired = coupon.effectiveStatus === "expired";
  const cannotActivate = expired && !storedActive;
  const pending = status.isPending || remove.isPending;

  function changeStatus() {
    setError(null);

    Alert.alert(
      storedActive ? "Desativar cupom" : "Ativar cupom",
      storedActive
        ? "O cupom deixa de aceitar resgates até ser ativado de novo."
        : "O cupom volta a aceitar resgates enquanto a validade permitir.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: storedActive ? "Desativar" : "Ativar",
          style: storedActive ? "destructive" : "default",
          onPress: () =>
            status.mutate(storedActive ? "disabled" : "active", {
              onError: (cause) => setError(cause.message),
            }),
        },
      ],
    );
  }

  function confirmDelete() {
    setError(null);

    Alert.alert(
      "Excluir cupom",
      "Cupons já usados em pedidos são arquivados em vez de apagados. A ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: (result) => {
                if (!result.archived) {
                  router.back();

                  return;
                }

                Alert.alert(
                  "Cupom arquivado",
                  "O cupom tem histórico de resgates e foi arquivado. Ele não aparece mais na lista.",
                  [{ text: "OK", onPress: () => router.back() }],
                );
              },
              onError: (cause) => setError(cause.message),
            }),
        },
      ],
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">Ações</Text>
      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <PressableScale
          accessibilityLabel="Editar cupom"
          className="items-center rounded-xl bg-primary px-4 py-3"
          onPress={() => router.push(`/management/coupons/${coupon.id}/edit`)}
        >
          <Text className="text-base font-semibold text-primary-foreground">Editar</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel={storedActive ? "Desativar cupom" : "Ativar cupom"}
          className="items-center rounded-xl border border-border px-4 py-3"
          disabled={pending || cannotActivate}
          onPress={changeStatus}
        >
          <Text className="text-base font-medium text-foreground">
            {storedActive ? "Desativar" : "Ativar"}
          </Text>
        </PressableScale>
        {cannotActivate ? (
          <Text className="text-xs text-muted-foreground">
            Cupom expirado: ajuste a data de término em Editar para poder ativá-lo.
          </Text>
        ) : null}
        <PressableScale
          accessibilityLabel="Excluir cupom"
          className="items-center rounded-xl border border-destructive px-4 py-3"
          disabled={pending}
          onPress={confirmDelete}
        >
          <Text className="text-base font-medium text-destructive">Excluir</Text>
        </PressableScale>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RedemptionsSection({ detail }: { detail: PanelCouponDetailOutput }) {
  if (detail.redemptions.length === 0) {
    return (
      <Section title="Resgates">
        <Text className="text-sm text-muted-foreground">Nenhum resgate ainda.</Text>
      </Section>
    );
  }

  return (
    <Section title="Resgates">
      {detail.redemptions.map((redemption) => (
        <View key={redemption.id} className="gap-0.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-sm font-medium text-card-foreground">
              {redemption.customer.name}
            </Text>
            <Text className="text-sm text-card-foreground">
              {formatBrl(redemption.discountCents)}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            Pedido {redemption.order.code} · {formatStamp(redemption.createdAt)}
          </Text>
        </View>
      ))}
      <Text className="pt-1 text-xs text-muted-foreground">{redemptionTotal(detail)}</Text>
    </Section>
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

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function moneyValue(cents: number | null, fallback: string): string {
  return cents === null ? fallback : formatBrl(cents);
}

function stampValue(iso: string | null, fallback: string): string {
  return iso === null ? fallback : formatStamp(iso);
}

function usageValue(coupon: PanelCouponSummary): string {
  return coupon.usageLimit === null
    ? `${coupon.usageCount} usos, sem limite`
    : `${coupon.usageCount} de ${coupon.usageLimit}`;
}

function perCustomerValue(limit: number | null): string {
  return limit === null ? "Sem limite" : `${limit} por cliente`;
}

function scopeValue(mode: CouponProductScopeMode): string {
  return mode === "include" ? "Somente os produtos listados" : "Todos, exceto os listados";
}

function redemptionTotal(detail: PanelCouponDetailOutput): string {
  if (detail.redemptions.length === detail.redemptionsTotal) {
    return countLabel(detail.redemptionsTotal, "resgate", "resgates");
  }

  return `${detail.redemptions.length} de ${detail.redemptionsTotal} resgates`;
}
