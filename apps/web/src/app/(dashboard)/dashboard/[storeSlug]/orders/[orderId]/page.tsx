import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { ORDER_STATUS_LABELS, getStore, getStoreOrderByCode } from "@/lib/mock-dashboard-data.ts";
import { formatBrl } from "@/lib/format.ts";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; orderId: string }>;
}) {
  const { storeSlug, orderId } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

  const order = getStoreOrderByCode(store.slug, orderId);

  if (!order) notFound();

  const basePath = `/dashboard/${store.slug}`;
  const total = formatBrl(order.total);

  return (
    <section aria-labelledby="order-detail-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="order-detail-heading" className="text-xl font-semibold tracking-tight">
            Pedido {order.code}
          </h2>
          <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Detalhes demonstrativos do pedido de {store.displayName}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium tabular-nums">{total}</dd>
              <dt className="text-muted-foreground">Feito em</dt>
              <dd>{order.createdAt}</dd>
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
