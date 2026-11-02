import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { CustomerCrumb } from "@/features/customers/components/customer-crumb.tsx";
import { loadCustomerFn } from "@/features/customers/server/customers.functions.ts";
import { formatBrl, formatDateTime, formatInteger } from "@/lib/format.ts";
import { FULFILMENT_STATUS_LABELS } from "@/lib/panel-labels.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/customers/$customerId")({
  loader: async ({ params }) => {
    const data = await loadCustomerFn({
      data: { storeSlug: params.storeSlug, customerId: params.customerId },
    });

    if (data.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    if (data.status === "not-found") throw notFound();

    return { customer: data.customer, orders: data.orders };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: pageTitle(loaderData?.customer.name ?? "Cliente") }],
  }),
  component: CustomerPage,
});

function CustomerPage() {
  const { customer, orders } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

  return (
    <CustomerCrumb customerId={customer.id} name={customer.name}>
      <section aria-labelledby="customer-detail-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 id="customer-detail-heading" className="text-xl font-semibold tracking-tight">
            {customer.name}
          </h2>
          <p className="text-sm text-muted-foreground">Ficha do cliente e seu histórico na loja.</p>
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
                <dd className="tabular-nums">{formatInteger(customer.ordersCount)}</dd>
                <dt className="text-muted-foreground">Total gasto</dt>
                <dd className="tabular-nums">{formatBrl(customer.totalSpentCents)}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Pedidos deste cliente</h3>

          {orders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
              Nenhum pedido deste cliente.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-surface">
              {orders.map((order) => (
                <li key={order.id} className="border-b border-border last:border-b-0">
                  <Link
                    to="/dashboard/$storeSlug/orders/$orderCode"
                    params={{ storeSlug, orderCode: order.code }}
                    preload="intent"
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{order.code}</span>
                    <Badge variant="secondary">
                      {FULFILMENT_STATUS_LABELS[order.fulfilmentStatus]}
                    </Badge>
                    <span className="tabular-nums">{formatBrl(order.totalCents)}</span>
                    <span className="text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                    <ArrowUpRight aria-hidden="true" className="ms-auto size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </CustomerCrumb>
  );
}
