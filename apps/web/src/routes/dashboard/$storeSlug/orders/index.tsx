import { createFileRoute, redirect } from "@tanstack/react-router";
import type { SearchParams } from "nuqs/server";
import { ReceiptText } from "lucide-react";
import { FinancialStatusSchema, PaymentMethodSchema } from "@menuza/shared/tenant";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { OrdersBoard } from "@/features/orders/components/orders-board.tsx";
import { listOrdersFn } from "@/features/orders/server/orders.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

/**
 * The first value of `values` that matches the raw query entry, so a hand-edited
 * URL falls back to "no filter" instead of sending the API a value its schema
 * rejects.
 */
function pick<T extends string>(
  values: readonly T[],
  raw: string | string[] | undefined,
): T | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;

  return values.find((candidate) => candidate === value);
}

export const Route = createFileRoute("/dashboard/$storeSlug/orders/")({
  // SAFETY: the router hands back raw query values (string, or string[] for a
  // repeated key); the loader narrows the two filters through the contract's
  // own option lists, so nothing unvalidated reaches the API.
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const financialStatus = pick(FinancialStatusSchema.options, deps.financialStatus);
    const paymentMethod = pick(PaymentMethodSchema.options, deps.paymentMethod);

    const payload = await listOrdersFn({
      data: { storeSlug: params.storeSlug, financialStatus, paymentMethod },
    });

    // No panel session: the layout already resolved the store, so signing in
    // again recovers.
    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { orders: payload.orders, financialStatus, paymentMethod };
  },
  head: () => ({ meta: [{ title: pageTitle("Pedidos") }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { storeSlug } = Route.useParams();
  const { orders, financialStatus, paymentMethod } = Route.useLoaderData();

  return (
    <section aria-labelledby="orders-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="orders-heading" className="text-xl font-semibold tracking-tight">
          Pedidos
        </h2>
        <p className="text-sm text-muted-foreground">
          O quadro anda conforme o preparo; qualquer mudança fica registrada no detalhe.
        </p>
      </div>

      {orders.length > 0 || financialStatus !== undefined || paymentMethod !== undefined ? (
        <OrdersBoard
          storeSlug={storeSlug}
          orders={orders}
          financialStatus={financialStatus}
          paymentMethod={paymentMethod}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptText aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum pedido ainda</EmptyTitle>
            <EmptyDescription>
              Os pedidos aparecem aqui assim que a loja receber o primeiro checkout.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
