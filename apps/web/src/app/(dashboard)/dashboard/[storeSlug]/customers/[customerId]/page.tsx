import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { formatBrl } from "@/lib/format.ts";
import { ORDER_STATUS_LABELS } from "@/lib/panel-labels.ts";
import { panelClient } from "@/lib/server-tenant.ts";
import { EmptyState } from "../../_components/empty-state.tsx";
import { CustomerCrumb } from "./customer-crumb.tsx";

/**
 * The customer and their orders, or `null` when the id is not in this store.
 *
 * An unknown id and another store's id are both `NOT_FOUND`, and both mean a
 * 404 here. The fetch is separate from the render so `notFound()` is never
 * called from a `catch` that wraps markup.
 */
async function loadCustomer(storeSlug: string, customerId: string) {
  const client = await panelClient();

  if (!client) return null;

  try {
    return await client.panel.getCustomer({ storeSlug, customerId });
  } catch {
    return null;
  }
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; customerId: string }>;
}) {
  const { storeSlug, customerId } = await params;
  const loaded = await loadCustomer(storeSlug, customerId);

  if (!loaded) notFound();

  const { customer, orders } = loaded;
  const basePath = `/dashboard/${storeSlug}`;

  return (
    <CustomerCrumb customerId={customerId} name={customer.name}>
      <section aria-labelledby="customer-detail-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 id="customer-detail-heading" className="text-xl font-semibold tracking-tight">
            {customer.name}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Ficha do cliente e seu histórico na loja.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Contato</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="break-all">{customer.email}</dd>
                <dt className="text-muted-foreground">Telefone</dt>
                <dd className="tabular-nums">{customer.phone}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Pedidos</dt>
                <dd className="font-medium tabular-nums">{customer.ordersCount}</dd>
                <dt className="text-muted-foreground">Total gasto</dt>
                <dd className="font-medium tabular-nums">{formatBrl(customer.totalSpentCents)}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Pedidos deste cliente</h3>
          {orders.length ? (
            <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-surface">
              {orders.map((order) => (
                <li key={order.id} className="border-b border-border last:border-b-0">
                  <Link
                    href={`${basePath}/orders/${order.code}`}
                    className="flex min-w-0 items-center gap-3 px-4 py-3 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <span className="min-w-0 truncate font-medium">{order.code}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatBrl(order.totalCents)}
                    </span>
                    <span className="ml-auto hidden shrink-0 text-muted-foreground tabular-nums sm:inline">
                      {order.createdAt.replace("T", " ").replace("Z", "")}
                    </span>
                    <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nenhum pedido deste cliente.</EmptyState>
          )}
        </div>
      </section>
    </CustomerCrumb>
  );
}
