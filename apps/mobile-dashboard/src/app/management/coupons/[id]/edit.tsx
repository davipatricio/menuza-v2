import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { CouponEditor, couponFormValues } from "@/components/coupon-form.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import { useCouponDetail, useUpdateCoupon } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/** One coupon in the same form the create screen uses, seeded with its stored rule. */
export default function EditCouponRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { storeSlug } = useSession();
  const coupon = useCouponDetail(storeSlug, id);
  const update = useUpdateCoupon(storeSlug, id);

  useEffect(() => {
    if (update.isSuccess) router.back();
  }, [update.isSuccess, router]);

  if (coupon.isPending) return <Loading />;

  if (!coupon.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Editar cupom" }} />
        <EmptyState title="Cupom indisponível" message="Não foi possível carregar este cupom." />
      </View>
    );
  }

  return (
    <CouponEditor
      error={update.error?.message}
      initial={couponFormValues(coupon.data.coupon)}
      onSubmit={(input) => update.mutate(input)}
      saveLabel="Salvar cupom"
      saved={update.isSuccess}
      saving={update.isPending}
      title="Editar cupom"
    />
  );
}
