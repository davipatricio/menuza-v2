import Link from "next/link";
import { notFound } from "next/navigation";
import type { PanelOrderDetail, PanelOrderTransition } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { formatBrl, formatDateTime } from "@/lib/format.ts";
import {
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_VARIANTS,
  FULFILMENT_STATUS_LABELS,
  FULFILMENT_STATUS_VARIANTS,
  ORDER_EVENT_LABELS,
  PAYMENT_METHOD_LABELS,
  orderLabel,
} from "@/lib/panel-labels.ts";
import { panelClient } from "@/lib/server-tenant.ts";
import { OrderActions } from "./order-actions.tsx";

/**
 * The order and its legal moves, or `null` when it is not in this store.
 *
 * An unknown code and another store's code are both `NOT_FOUND`, and both mean a
 * 404 here. The transitions come from the API so the buttons and the server
 * agree on what is legal for this caller.
 */
async function loadOrder(
  storeSlug: string,
  orderCode: string,
): Promise<{ order: PanelOrderDetail; transitions: PanelOrderTransition[] } | null> {
  const client = await panelClient();

  if (!client) return null;

  try {
    const [{ order }, { transitions }] = await Promise.all([
      client.panel.getOrder({ storeSlug, orderCode }),
      client.panel.getOrderTransitions({ storeSlug, orderCode }),
    ]);

    return { order, transitions };
  } catch {
    return null;
  }
}

/** Moves that take money back read as danger; notes as neutral metadata. */
function eventVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  if (type === "refunded" || type === "cashback_reversed") return "destructive";

  if (type === "note") return "outline";

  if (type === "payment_recorded") return "default";

  return "secondary";
}

/** The money breakdown, every line in cents through `formatBrl`. */
function MoneyBreakdown({ order }: { order: PanelOrderDetail }) {
  const rows = [
    { label: "Subtotal", cents: order.subtotalCents },
    { label: "Desconto", cents: order.discountCents },
    { label: "Frete", cents: order.shippingCents },
    { label: "Carteira", cents: order.walletAppliedCents },
    { label: "Cashback", cents: order.cashbackCents },
  ];

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right tabular-nums">{formatBrl(row.cents)}</dd>
        </div>
      ))}
      <Separator className="col-span-2" />
      <div className="col-span-2 grid grid-cols-subgrid text-base">
        <dt className="font-medium">Total</dt>
        <dd className="text-right font-medium tabular-nums">{formatBrl(order.totalCents)}</dd>
      </div>
    </dl>
  );
}

function EventTimeline({ order }: { order: PanelOrderDetail }) {
  return (
    <ol className="flex flex-col gap-3">
      {order.events.map((event, index) => (
        <li key={event.id} className="flex flex-col gap-3">
          {index > 0 ? <Separator /> : null}
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={eventVariant(event.type)}>
                {orderLabel(ORDER_EVENT_LABELS, event.type)}
              </Badge>
              {event.toValue ? (
                <span className="tabular-nums">
                  {event.fromValue ?? "—"} → {event.toValue}
                </span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(event.createdAt)}
              {event.actorName ? ` · ${event.actorName}` : ""}
            </span>
            {event.reason ? (
              <span className="text-sm text-pretty text-muted-foreground">{event.reason}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; orderCode: string }>;
}) {
  const { storeSlug, orderCode } = await params;
  const loaded = await loadOrder(storeSlug, orderCode);

  if (!loaded) notFound();

  const { order, transitions } = loaded;

  return (
    <section aria-labelledby="order-detail-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="order-detail-heading" className="text-xl font-semibold tracking-tight">
          Pedido {order.code}
        </h2>
        <Badge variant={FULFILMENT_STATUS_VARIANTS[order.fulfilmentStatus]}>
          {FULFILMENT_STATUS_LABELS[order.fulfilmentStatus]}
        </Badge>
        <Badge variant={FINANCIAL_STATUS_VARIANTS[order.financialStatus]}>
          {FINANCIAL_STATUS_LABELS[order.financialStatus]}
        </Badge>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
            <CardDescription>Cliente, pagamento e valores do pedido.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="min-w-0 truncate">
                <Link
                  href={`/dashboard/${storeSlug}/customers/${order.customerId}`}
                  className="underline underline-offset-4"
                >
                  {order.customerName}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Pagamento</dt>
              <dd>
                {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : "Não informado"}
              </dd>
              <dt className="text-muted-foreground">Criado em</dt>
              <dd className="tabular-nums">{formatDateTime(order.createdAt)}</dd>
            </dl>
            <Separator />
            <MoneyBreakdown order={order} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
            <CardDescription>Quantidade, opções e total por linha.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">
                      {item.name}
                      {item.optionsLabel ? (
                        <span className="block text-xs text-muted-foreground">
                          {item.optionsLabel}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBrl(item.lineTotalCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Linha do tempo</CardTitle>
            <CardDescription>Cada mudança de status, com autor e motivo.</CardDescription>
          </CardHeader>
          <CardContent>
            {order.events.length ? (
              <EventTimeline order={order} />
            ) : (
              <Empty className="border px-3 py-6">
                <EmptyHeader>
                  <EmptyTitle>Nenhum evento registrado</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ações</CardTitle>
          <CardDescription>
            Mudanças liberadas para o seu acesso neste estado do pedido.
          </CardDescription>
        </CardHeader>
        <OrderActions
          storeSlug={storeSlug}
          orderCode={order.code}
          financialStatus={order.financialStatus}
          transitions={transitions}
        />
      </Card>

      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/dashboard/${storeSlug}/orders`} aria-label="Voltar para pedidos" />}
        >
          Voltar para pedidos
        </Button>
      </div>
    </section>
  );
}
