import { useRouter } from "expo-router";
import { useEffect } from "react";

import { CouponEditor, EMPTY_COUPON_FORM } from "@/components/coupon-form.tsx";
import { useCreateCoupon } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/** A new coupon: the same form the edit screen uses, seeded with an empty draft. */
export default function NewCouponRoute() {
  const router = useRouter();
  const { storeSlug } = useSession();
  const create = useCreateCoupon(storeSlug);

  useEffect(() => {
    if (create.isSuccess) router.back();
  }, [create.isSuccess, router]);

  return (
    <CouponEditor
      error={create.error?.message}
      initial={EMPTY_COUPON_FORM}
      onSubmit={(input) => create.mutate(input)}
      saveLabel="Criar cupom"
      saved={create.isSuccess}
      saving={create.isPending}
      title="Novo cupom"
    />
  );
}
