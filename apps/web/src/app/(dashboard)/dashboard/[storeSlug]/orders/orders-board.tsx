"use client";

/**
 * Order board. A client island: the server page reads the rows through the panel
 * contract and hands them down, so switching a filter is a URL change and a
 * server re-read — never a fetch in the browser.
 *
 * Columns are the `fulfilmentStatus` values a card can sit in. The two terminal
 * states are reached at most once per order and would otherwise be two columns
 * that are empty forever, so they live in a collapsed section at the end rather
 * than as a page filter: a filter would hide them from the board entirely.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  FinancialStatus,
  FulfilmentStatus,
  PanelOrder,
  PaymentMethod,
} from "@menuza/shared/tenant";
import { FinancialStatusSchema, PaymentMethodSchema } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { formatBrl, formatDateTime, formatRelativeTime } from "@/lib/format.ts";
import {
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_VARIANTS,
  FULFILMENT_STATUS_LABELS,
  FULFILMENT_STATUS_VARIANTS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/panel-labels.ts";

/** Columns that hold a live card, in kitchen order. */
const BOARD_COLUMNS = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "ready_for_pickup",
  "out_for_delivery",
] as const satisfies readonly FulfilmentStatus[];

const TERMINAL_COLUMNS = ["completed", "canceled"] as const satisfies readonly FulfilmentStatus[];

const FINANCIAL_FILTERS = FinancialStatusSchema.options.map((value) => ({
  value,
  label: FINANCIAL_STATUS_LABELS[value],
}));

const PAYMENT_FILTERS = PaymentMethodSchema.options.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

interface FilterOption {
  value: string;
  label: string;
}

/**
 * One combobox per filter. Changing it writes the value — or removes the key when
 * cleared — into the query string, which is what the server read consumes. The
 * current value arrives as a prop so this island never reads the URL itself.
 */
function BoardFilter({
  name,
  current,
  options,
  placeholder,
  label,
}: {
  name: string;
  current: string | null;
  options: FilterOption[];
  placeholder: string;
  label: string;
}) {
  const router = useRouter();
  const selected = options.find((option) => option.value === current) ?? null;

  const select = (option: FilterOption | null) => {
    const next = new URLSearchParams(window.location.search);

    if (option) next.set(name, option.value);
    else next.delete(name);

    const query = next.toString();

    router.push(query ? `?${query}` : "?", { scroll: false });
  };

  return (
    <Combobox
      items={options}
      itemToStringValue={(option) => option.label}
      value={selected}
      onValueChange={select}
    >
      <ComboboxInput className="min-w-52" placeholder={placeholder} aria-label={label} showClear />
      <ComboboxContent>
        <ComboboxEmpty>Nenhuma opção encontrada.</ComboboxEmpty>
        <ComboboxList>
          {(option) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function OrderCard({ order, basePath }: { order: PanelOrder; basePath: string }) {
  return (
    <Link
      href={`${basePath}/orders/${order.code}`}
      aria-label={`Abrir pedido ${order.code}`}
      className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card size="sm" className="gap-2 transition-colors hover:bg-muted">
        <CardHeader>
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle className="font-mono text-sm tabular-nums">{order.code}</CardTitle>
            <Tooltip>
              <TooltipTrigger
                render={
                  <time
                    dateTime={order.createdAt}
                    aria-label={`Criado em ${formatDateTime(order.createdAt)}`}
                    className="shrink-0 text-xs text-muted-foreground"
                  />
                }
              >
                {formatRelativeTime(order.createdAt)}
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(order.createdAt)}</TooltipContent>
            </Tooltip>
          </div>
          <CardDescription className="truncate">{order.customerName}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={FULFILMENT_STATUS_VARIANTS[order.fulfilmentStatus]}>
              {FULFILMENT_STATUS_LABELS[order.fulfilmentStatus]}
            </Badge>
            <Badge variant={FINANCIAL_STATUS_VARIANTS[order.financialStatus]}>
              {FINANCIAL_STATUS_LABELS[order.financialStatus]}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-sm font-medium tabular-nums">{formatBrl(order.totalCents)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function BoardColumn({
  status,
  orders,
  basePath,
}: {
  status: FulfilmentStatus;
  orders: PanelOrder[];
  basePath: string;
}) {
  return (
    <Card size="sm" className="min-w-64">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b">
        <CardTitle>
          <h3>{FULFILMENT_STATUS_LABELS[status]}</h3>
        </CardTitle>
        <Badge variant="secondary" className="tabular-nums">
          {orders.length}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {orders.length ? (
          <ul className="flex flex-col gap-2">
            {orders.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} basePath={basePath} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty className="border px-3 py-6">
            <EmptyHeader>
              <EmptyTitle className="text-xs">Nenhum pedido nesta etapa</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

export function OrdersBoard({
  orders,
  basePath,
  financialStatus,
  paymentMethod,
}: {
  orders: PanelOrder[];
  basePath: string;
  financialStatus: FinancialStatus | undefined;
  paymentMethod: PaymentMethod | undefined;
}) {
  const byStatus = (status: FulfilmentStatus) =>
    orders.filter((order) => order.fulfilmentStatus === status);

  const terminalCount = orders.filter(
    (order) => order.fulfilmentStatus === "completed" || order.fulfilmentStatus === "canceled",
  ).length;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <BoardFilter
            name="financialStatus"
            current={financialStatus ?? null}
            options={FINANCIAL_FILTERS}
            placeholder="Pagamento…"
            label="Filtrar por status do pagamento"
          />
          <BoardFilter
            name="paymentMethod"
            current={paymentMethod ?? null}
            options={PAYMENT_FILTERS}
            placeholder="Forma de pagamento…"
            label="Filtrar por forma de pagamento"
          />
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <div className="grid auto-cols-[minmax(16rem,1fr)] grid-flow-col items-start gap-4">
            {BOARD_COLUMNS.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                orders={byStatus(status)}
                basePath={basePath}
              />
            ))}
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Concluídos e cancelados ({terminalCount})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
              {TERMINAL_COLUMNS.map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  orders={byStatus(status)}
                  basePath={basePath}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </TooltipProvider>
  );
}
