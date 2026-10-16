import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { CouponCreateForm } from "../coupon-form.tsx";

// Reads the session and the store slug on every request, like the shell.
export const instant = false;

export default async function NewCouponPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  return (
    <section aria-labelledby="coupon-new-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="coupon-new-heading" className="text-xl font-semibold tracking-tight">
          Novo cupom
        </h2>
        <p className="text-sm text-muted-foreground">
          Crie uma promoção com regras de uso, validade e limites.
        </p>
      </div>
      <CouponCreateForm storeSlug={storeSlug} />
    </section>
  );
}
