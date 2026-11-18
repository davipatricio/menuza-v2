import { Stack, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { ManagementList, ManagementRow } from "@/components/management.tsx";
import {
  couponDiscount,
  couponRedemptionMeta,
  couponStatusLabel,
  useCouponSummaries,
} from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/** The store's coupons: one row per code, with the create action in the header. */
export default function CouponsRoute() {
  const router = useRouter();
  const { storeSlug } = useSession();
  const coupons = useCouponSummaries(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Cupons",
          headerRight: () => (
            <Pressable
              accessibilityLabel="Novo cupom"
              accessibilityRole="button"
              onPress={() => router.push("/management/coupons/new")}
            >
              <Text className="text-sm font-semibold text-primary">Novo cupom</Text>
            </Pressable>
          ),
        }}
      />
      <ManagementList
        description="Cupons da loja, o desconto de cada um e o histórico de resgates."
        data={coupons.data ?? []}
        error={coupons.error}
        isPending={coupons.isPending}
        isRefetching={coupons.isRefetching}
        onRefresh={() => void coupons.refetch()}
        keyExtractor={(coupon) => coupon.id}
        emptyTitle="Nenhum cupom"
        emptyMessage="Toque em Novo cupom para criar o primeiro."
        renderItem={(coupon) => (
          <ManagementRow
            title={coupon.code}
            subtitle={`${couponStatusLabel(coupon.effectiveStatus)} · ${couponDiscount(coupon)}`}
            meta={couponRedemptionMeta(coupon)}
            onPress={() => router.push(`/management/coupons/${coupon.id}`)}
          />
        )}
      />
    </View>
  );
}
