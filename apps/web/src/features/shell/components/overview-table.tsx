/**
 * The "recent orders" preview on the overview. A client island reusing the
 * orders table without its toolbar, since the page already scopes the data.
 */
import type { PanelOrder } from "@menuza/shared/tenant";
import { OrdersTable } from "@/features/orders/components/orders-table.tsx";

export function OverviewTable({
  orders,
  basePath,
  storeSlug,
}: {
  orders: PanelOrder[];
  basePath: string;
  storeSlug: string;
}) {
  return (
    <OrdersTable
      orders={orders}
      basePath={basePath}
      storeSlug={storeSlug}
      hideToolbar
      tableLabel="Pedidos recentes"
    />
  );
}
