import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { CouponsTable } from "./coupons-table.tsx";

export default async function CouponsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { coupons } = await client.panel.listCoupons({ storeSlug });

  return (
    <section aria-labelledby="coupons-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="coupons-heading" className="text-xl font-semibold tracking-tight">
          Cupons
        </h2>
        <p className="text-sm text-muted-foreground">
          Gerencie cupons promocionais, limites de uso e validade.
        </p>
      </div>
      <CouponsTable coupons={coupons} storeSlug={storeSlug} />
    </section>
  );
}
