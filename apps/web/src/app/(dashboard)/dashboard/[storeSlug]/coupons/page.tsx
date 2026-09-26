import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { EmptyState } from "../_components/empty-state.tsx";
import { CouponsTable } from "./coupons-table.tsx";

export default async function CouponsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { coupons } = await client.panel.listCoupons({ storeSlug });

  return (
    <section aria-labelledby="coupons-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="coupons-heading" className="text-xl font-semibold tracking-tight">
          Cupons
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">Cupons promocionais da loja.</p>
      </div>

      {coupons.length ? (
        <CouponsTable coupons={coupons} storeSlug={storeSlug} />
      ) : (
        <EmptyState>Nenhum cupom ainda. Os cupons da loja aparecem aqui.</EmptyState>
      )}
    </section>
  );
}
