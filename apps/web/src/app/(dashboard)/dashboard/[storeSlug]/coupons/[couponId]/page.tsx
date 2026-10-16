import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { CouponEditForm } from "../coupon-form.tsx";

// Reads the session and the store slug on every request, like the shell.
export const instant = false;

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ storeSlug: string; couponId: string }>;
}) {
  const { storeSlug, couponId } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { coupons } = await client.panel.listCoupons({ storeSlug });
  const coupon = coupons.find((item) => item.id === couponId);

  if (!coupon) notFound();

  return (
    <section aria-labelledby="coupon-edit-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="coupon-edit-heading" className="text-xl font-semibold tracking-tight">
          Editar cupom
        </h2>
        <p className="text-sm text-muted-foreground">
          {coupon.code}: altere desconto, status, limites e validade.
        </p>
      </div>
      <CouponEditForm storeSlug={storeSlug} coupon={coupon} />
    </section>
  );
}
