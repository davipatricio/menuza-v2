import { notFound } from "next/navigation";
import { ReceiptTextIcon } from "lucide-react";
import type { FinancialStatus, PaymentMethod } from "@menuza/shared/tenant";
import { FinancialStatusSchema, PaymentMethodSchema } from "@menuza/shared/tenant";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { OrdersBoard } from "./orders-board.tsx";

/**
 * A closed-set search param, or `undefined` when it is absent or not one of the
 * contract's slugs. A hand-edited URL then falls back to "no filter" instead of
 * sending the API a value its own schema would reject.
 */
function pick<T extends string>(
  values: readonly T[],
  raw: string | string[] | undefined,
): T | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;

  return values.find((candidate) => candidate === value);
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeSlug } = await params;
  const query = await searchParams;
  const client = await panelClient();

  if (!client) notFound();

  const financialStatus = pick<FinancialStatus>(
    FinancialStatusSchema.options,
    query.financialStatus,
  );

  const paymentMethod = pick<PaymentMethod>(PaymentMethodSchema.options, query.paymentMethod);

  const { orders } = await client.panel.listOrders({ storeSlug, financialStatus, paymentMethod });

  return (
    <section aria-labelledby="orders-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="orders-heading" className="text-xl font-semibold tracking-tight">
          Pedidos
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          O quadro anda conforme o preparo; qualquer mudança fica registrada no detalhe.
        </p>
      </div>

      {orders.length || financialStatus || paymentMethod ? (
        <OrdersBoard
          orders={orders}
          basePath={`/dashboard/${storeSlug}`}
          financialStatus={financialStatus}
          paymentMethod={paymentMethod}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon aria-hidden="true" />
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
