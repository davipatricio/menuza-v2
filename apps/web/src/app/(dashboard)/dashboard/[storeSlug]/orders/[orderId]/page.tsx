import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { formatBrl } from "@/lib/format.ts";
import { ORDER_STATUS_LABELS, ORDER_STATUS_VARIANTS } from "@/lib/panel-labels.ts";
import { panelClient } from "@/lib/server-tenant.ts";

/**
 * The order, or `null` when it is not in this store.
 *
 * An unknown code and another store's code are both `NOT_FOUND`, and both mean
 * a 404 here. The fetch is separate from the render so `notFound()` is never
 * called from a `catch` that wraps markup.
 */
async function loadOrder(storeSlug: string, orderCode: string) {
  const client = await panelClient();

  if (!client) return null;

  try {
    const { order } = await client.panel.getOrder({ storeSlug, orderCode });

    return order;
  } catch {
    return null;
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; orderId: string }>;
}) {
  const { storeSlug, orderId } = await params;
  const order = await loadOrder(storeSlug, orderId);

  if (!order) notFound();

  const basePath = `/dashboard/${storeSlug}`;

  return (
    <section aria-labelledby="order-detail-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="order-detail-heading" className="text-xl font-semibold tracking-tight">
            Pedido {order.code}
          </h2>
          <Badge variant={ORDER_STATUS_VARIANTS[order.status]}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
        </div>
        <p className="text-sm text-pretty text-muted-foreground">Detalhes do pedido.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium tabular-nums">{formatBrl(order.totalCents)}</dd>
              <dt className="text-muted-foreground">Feito em</dt>
              <dd>{order.createdAt.replace("T", " ").replace("Z", "")}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`${basePath}/customers/${order.customerId}`}
              className="text-sm font-medium underline underline-offset-4"
            >
              {order.customerName}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastro completo na página do cliente.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
