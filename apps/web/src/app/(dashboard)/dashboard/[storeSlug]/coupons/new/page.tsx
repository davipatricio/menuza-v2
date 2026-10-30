import { Suspense } from "react";
import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { SimpleLoading } from "../../_components/simple-loading.tsx";
import { CouponCreateForm } from "../coupon-form.tsx";

export const instant = true;

export default function NewCouponPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  return (
    <Suspense fallback={<SimpleLoading label="Carregando cupom" />}>
      <NewCoupon params={params} />
    </Suspense>
  );
}

async function NewCoupon({ params }: { params: Promise<{ storeSlug: string }> }) {
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
