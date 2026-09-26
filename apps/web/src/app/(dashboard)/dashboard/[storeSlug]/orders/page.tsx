import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { EmptyState } from "../_components/empty-state.tsx";
import { OrdersTable } from "./orders-table.tsx";

export default async function OrdersPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { orders } = await client.panel.listOrders({ storeSlug });
  const basePath = `/dashboard/${storeSlug}`;

  return (
    <section aria-labelledby="orders-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="orders-heading" className="text-xl font-semibold tracking-tight">
          Pedidos
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Listagem densa de pedidos da loja.
        </p>
      </div>

      {orders.length ? (
        <OrdersTable orders={orders} basePath={basePath} storeSlug={storeSlug} />
      ) : (
        <EmptyState>Nenhum pedido ainda. Os pedidos da loja aparecem aqui.</EmptyState>
      )}
    </section>
  );
}
