"use client";

/**
 * Mocked sales analytics for one product. There is no orders roll-up for a
 * single product yet, so every number below is illustrative: the screen exists
 * to lock the layout and the questions owners ask (ticket, LTV, recompra,
 * cross-sell) before the real collection lands.
 */
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  CircleHelp,
  Clock,
  CreditCard,
  Package,
  Percent,
  Receipt,
  Repeat2,
  ShoppingBasket,
  ShoppingCart,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { nudgeKomi } from "@/components/assistant-ui/komi-nudge.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  formatBrl,
  formatBrlCompact,
  formatDecimal,
  formatInteger,
  formatPercent,
} from "@/lib/format.ts";

type RangeKey = "7d" | "30d" | "90d" | "12m";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
];

type SeriesPoint = { label: string; revenueCents: number; orders: number };

type PaymentShare = { label: string; pct: number };

type RangeData = {
  series: SeriesPoint[];
  units: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  customerTicketCents: number;
  ltvCents: number;
  repeatPct: number;
  revenueSharePct: number;
  discountPct: number;
  weekdays: number[];
  peakHours: number[];
  channels: { deliveryPct: number; pickupPct: number };
  payments: PaymentShare[];
  trend: {
    revenue: number;
    orders: number;
    ticket: number;
    units: number;
    customers: number;
    customerTicket: number;
    ltv: number;
    repeat: number;
    revenueShare: number;
    itemsPerOrder: number;
    frequency: number;
    discount: number;
  };
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const PEAK_HOURS = ["11–14h", "14–17h", "17–20h", "20–23h"];

const RANGE_DATA: Record<RangeKey, RangeData> = {
  "7d": {
    series: [
      { label: "18/10", revenueCents: 42_900, orders: 9 },
      { label: "19/10", revenueCents: 38_500, orders: 8 },
      { label: "20/10", revenueCents: 51_200, orders: 11 },
      { label: "21/10", revenueCents: 47_800, orders: 10 },
      { label: "22/10", revenueCents: 68_400, orders: 14 },
      { label: "23/10", revenueCents: 92_100, orders: 19 },
      { label: "24/10", revenueCents: 74_300, orders: 15 },
    ],
    units: 112,
    customers: 63,
    newCustomers: 39,
    returningCustomers: 24,
    customerTicketCents: 7_900,
    ltvCents: 34_500,
    repeatPct: 34,
    revenueSharePct: 9.8,
    discountPct: 5.2,
    weekdays: [10, 9, 12, 11, 14, 18, 12],
    peakHours: [12, 9, 26, 39],
    channels: { deliveryPct: 68, pickupPct: 32 },
    payments: [
      { label: "Pix", pct: 41 },
      { label: "Crédito", pct: 33 },
      { label: "Débito", pct: 13 },
      { label: "Vale", pct: 9 },
      { label: "Dinheiro", pct: 4 },
    ],
    trend: {
      revenue: 8.4,
      orders: 5.1,
      ticket: 3.2,
      units: 6.7,
      customers: 4.3,
      customerTicket: 2.1,
      ltv: 3.8,
      repeat: 1.2,
      revenueShare: 0.8,
      itemsPerOrder: 1.4,
      frequency: 2.3,
      discount: -0.6,
    },
  },
  "30d": {
    series: [
      { label: "26/09", revenueCents: 218_400, orders: 42 },
      { label: "01/10", revenueCents: 241_700, orders: 48 },
      { label: "06/10", revenueCents: 268_900, orders: 55 },
      { label: "11/10", revenueCents: 252_300, orders: 51 },
      { label: "16/10", revenueCents: 301_800, orders: 61 },
      { label: "21/10", revenueCents: 287_600, orders: 58 },
    ],
    units: 436,
    customers: 212,
    newCustomers: 119,
    returningCustomers: 93,
    customerTicketCents: 8_600,
    ltvCents: 39_800,
    repeatPct: 38,
    revenueSharePct: 12.4,
    discountPct: 6.8,
    weekdays: [38, 41, 45, 43, 49, 52, 47],
    peakHours: [38, 29, 96, 152],
    channels: { deliveryPct: 64, pickupPct: 36 },
    payments: [
      { label: "Pix", pct: 43 },
      { label: "Crédito", pct: 31 },
      { label: "Débito", pct: 14 },
      { label: "Vale", pct: 8 },
      { label: "Dinheiro", pct: 4 },
    ],
    trend: {
      revenue: 12.4,
      orders: 8.1,
      ticket: 3.9,
      units: 10.2,
      customers: 6.4,
      customerTicket: 2.7,
      ltv: 5.3,
      repeat: 1.8,
      revenueShare: 1.2,
      itemsPerOrder: 2.1,
      frequency: 1.8,
      discount: 0.4,
    },
  },
  "90d": {
    series: [
      { label: "S1", revenueCents: 352_000, orders: 74 },
      { label: "S2", revenueCents: 386_500, orders: 80 },
      { label: "S3", revenueCents: 421_200, orders: 88 },
      { label: "S4", revenueCents: 398_800, orders: 84 },
      { label: "S5", revenueCents: 455_400, orders: 95 },
      { label: "S6", revenueCents: 449_900, orders: 93 },
      { label: "S7", revenueCents: 482_300, orders: 101 },
      { label: "S8", revenueCents: 468_100, orders: 98 },
      { label: "S9", revenueCents: 511_600, orders: 107 },
      { label: "S10", revenueCents: 494_400, orders: 103 },
      { label: "S11", revenueCents: 532_900, orders: 112 },
      { label: "S12", revenueCents: 526_500, orders: 110 },
    ],
    units: 1_512,
    customers: 704,
    newCustomers: 366,
    returningCustomers: 338,
    customerTicketCents: 9_200,
    ltvCents: 44_700,
    repeatPct: 43,
    revenueSharePct: 14.1,
    discountPct: 7.4,
    weekdays: [140, 148, 164, 157, 178, 186, 172],
    peakHours: [132, 104, 354, 555],
    channels: { deliveryPct: 61, pickupPct: 39 },
    payments: [
      { label: "Pix", pct: 45 },
      { label: "Crédito", pct: 30 },
      { label: "Débito", pct: 13 },
      { label: "Vale", pct: 8 },
      { label: "Dinheiro", pct: 4 },
    ],
    trend: {
      revenue: 18.7,
      orders: 14.2,
      ticket: 4.1,
      units: 16.4,
      customers: 11.8,
      customerTicket: 3.4,
      ltv: 7.9,
      repeat: 2.6,
      revenueShare: 1.6,
      itemsPerOrder: 0.9,
      frequency: 2.6,
      discount: -0.3,
    },
  },
  "12m": {
    series: [
      { label: "Nov", revenueCents: 1_320_000, orders: 278 },
      { label: "Dez", revenueCents: 1_280_000, orders: 270 },
      { label: "Jan", revenueCents: 1_410_000, orders: 296 },
      { label: "Fev", revenueCents: 1_390_000, orders: 292 },
      { label: "Mar", revenueCents: 1_520_000, orders: 321 },
      { label: "Abr", revenueCents: 1_480_000, orders: 312 },
      { label: "Mai", revenueCents: 1_610_000, orders: 339 },
      { label: "Jun", revenueCents: 1_590_000, orders: 335 },
      { label: "Jul", revenueCents: 1_720_000, orders: 362 },
      { label: "Ago", revenueCents: 1_680_000, orders: 354 },
      { label: "Set", revenueCents: 1_850_000, orders: 389 },
      { label: "Out", revenueCents: 1_790_000, orders: 377 },
    ],
    units: 5_284,
    customers: 1_846,
    newCustomers: 849,
    returningCustomers: 997,
    customerTicketCents: 9_900,
    ltvCents: 48_900,
    repeatPct: 49,
    revenueSharePct: 16.7,
    discountPct: 8.1,
    weekdays: [492, 510, 566, 548, 610, 632, 567],
    peakHours: [452, 361, 1_218, 1_894],
    channels: { deliveryPct: 58, pickupPct: 42 },
    payments: [
      { label: "Pix", pct: 44 },
      { label: "Crédito", pct: 31 },
      { label: "Débito", pct: 14 },
      { label: "Vale", pct: 7 },
      { label: "Dinheiro", pct: 4 },
    ],
    trend: {
      revenue: 26.3,
      orders: 21.5,
      ticket: 4.6,
      units: 24.1,
      customers: 18.9,
      customerTicket: 4.2,
      ltv: 11.4,
      repeat: 3.5,
      revenueShare: 2.1,
      itemsPerOrder: 1.7,
      frequency: 3.1,
      discount: 0.8,
    },
  },
};

const CROSS_SELL = [
  { name: "Pizza calabresa", sharePct: 38, ticketCents: 8_450, orders: 142 },
  { name: "Refrigerante 350 ml", sharePct: 32, ticketCents: 7_900, orders: 119 },
  { name: "Batata frita", sharePct: 21, ticketCents: 10_200, orders: 78 },
  { name: "Brownie", sharePct: 14, ticketCents: 12_600, orders: 52 },
];

/** One nudge per page load, so switching tabs does not repeat the bubble. */
let performanceNudgeSent = false;

function MetricHelp({ metric, children }: { metric: string; children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        closeOnClick={false}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-my-0.5 text-muted-foreground"
            aria-label={`O que significa ${metric}`}
          />
        }
      >
        <CircleHelp data-icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-64 text-pretty">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function KpiCard({
  label,
  value,
  trend,
  hint,
  help,
  icon: Icon,
}: {
  label: string;
  value: string;
  trend: number;
  hint: string;
  help?: string;
  icon: typeof Banknote;
}) {
  const positive = trend >= 0;

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <CardTitle className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground">
          <span className="min-w-0">{label}</span>
          {help ? <MetricHelp metric={label}>{help}</MetricHelp> : null}
        </CardTitle>
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon className="size-3.5" />
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {positive ? (
              <ArrowUpRight data-icon="inline-start" aria-hidden="true" />
            ) : (
              <ArrowDownRight data-icon="inline-start" aria-hidden="true" />
            )}
            {formatPercent(Math.abs(trend), 1)}
          </Badge>
          <span className="text-xs text-muted-foreground">vs. período anterior</span>
        </div>
        <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** CSS bars: no chart dependency, no gradient, and a text alternative for AT. */
function RevenueChart({ data }: { data: SeriesPoint[] }) {
  const max = Math.max(...data.map((point) => point.revenueCents), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label="Receita por período, do mais antigo ao mais recente. Valores em reais."
          className="flex items-end gap-1.5"
        >
          {data.map((point) => (
            <div key={point.label} className="flex min-w-14 flex-1 flex-col items-center gap-1">
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {formatBrlCompact(point.revenueCents)}
              </span>
              <div className="flex h-36 w-full items-end">
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{
                    height: `${Math.max(4, Math.round((point.revenueCents / max) * 100))}%`,
                  }}
                  title={`${point.label}: ${formatBrl(point.revenueCents)} · ${formatInteger(point.orders)} pedidos`}
                />
              </div>
              <span className="truncate text-xs text-muted-foreground">{point.label}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {data.map((point) => (
          <li key={point.label}>
            {`${point.label}: ${formatBrl(point.revenueCents)}, ${formatInteger(point.orders)} pedidos`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HorizontalBars({
  items,
  formatValue = formatInteger,
}: {
  items: { label: string; value: number }[];
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">{item.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-xs tabular-nums">
            {formatValue(item.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeekdayChart({ values }: { values: number[] }) {
  return (
    <HorizontalBars
      items={values.map((value, index) => ({ label: WEEKDAYS[index] ?? "", value }))}
    />
  );
}

function PeakHourChart({ values }: { values: number[] }) {
  return (
    <HorizontalBars
      items={values.map((value, index) => ({ label: PEAK_HOURS[index] ?? "", value }))}
    />
  );
}

function CustomerMix({ data }: { data: RangeData }) {
  const newPct = Math.round((data.newCustomers / data.customers) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <span className="h-full bg-primary" style={{ width: `${newPct}%` }} />
        <span className="h-full bg-primary/30" style={{ width: `${100 - newPct}%` }} />
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span>Novos</span>
          <span className="ml-auto tabular-nums">
            {formatInteger(data.newCustomers)} · {formatPercent(newPct)}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-primary/30" aria-hidden="true" />
          <span>Recorrentes</span>
          <span className="ml-auto tabular-nums">
            {formatInteger(data.returningCustomers)} · {formatPercent(100 - newPct)}
          </span>
        </li>
      </ul>
      <p className="text-xs text-pretty text-muted-foreground">
        Recompra em 90 dias: {formatPercent(data.repeatPct)}.
      </p>
    </div>
  );
}

function ChannelSplit({ data, orders }: { data: RangeData; orders: number }) {
  const delivery = Math.round((orders * data.channels.deliveryPct) / 100);
  const pickup = orders - delivery;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <span className="h-full bg-primary" style={{ width: `${data.channels.deliveryPct}%` }} />
        <span className="h-full bg-primary/30" style={{ width: `${data.channels.pickupPct}%` }} />
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span>Entrega</span>
          <span className="ml-auto tabular-nums">
            {formatInteger(delivery)} · {formatPercent(data.channels.deliveryPct)}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-primary/30" aria-hidden="true" />
          <span>Retirada</span>
          <span className="ml-auto tabular-nums">
            {formatInteger(pickup)} · {formatPercent(data.channels.pickupPct)}
          </span>
        </li>
      </ul>
    </div>
  );
}

function PaymentShares({ items }: { items: PaymentShare[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">{item.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatPercent(item.pct)}
            </span>
          </div>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${item.pct}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function CrossSellList() {
  return (
    <ul className="flex flex-col gap-3">
      {CROSS_SELL.map((item) => (
        <li key={item.name} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{item.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatPercent(item.sharePct)} dos pedidos
            </span>
          </div>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${item.sharePct}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Ticket médio de quem leva os dois: {formatBrl(item.ticketCents)} ·{" "}
            {formatInteger(item.orders)} pedidos
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ProductPerformance({ productName }: { productName: string }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const data = RANGE_DATA[range];
  const revenueCents = data.series.reduce((total, point) => total + point.revenueCents, 0);
  const orders = data.series.reduce((total, point) => total + point.orders, 0);
  const ticketCents = orders === 0 ? 0 : Math.round(revenueCents / orders);
  const itemsPerOrder = orders === 0 ? 0 : data.units / orders;

  useEffect(() => {
    if (performanceNudgeSent) return;

    // Let the shell's FAB subscribe before the first nudge of the session.
    const timer = window.setTimeout(() => {
      if (performanceNudgeSent) return;

      performanceNudgeSent = true;
      nudgeKomi(
        "Posso explicar estes números, personalizar a análise e trazer mais insights. Quer conversar?",
      );
    }, 400);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <TooltipProvider>
      <section aria-labelledby="product-performance-heading" className="flex flex-col gap-6">
        <h3 id="product-performance-heading" className="sr-only">
          Desempenho de {productName}
        </h3>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-medium">Indicadores do período</h4>
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[range]}
            aria-label="Período dos indicadores"
            onValueChange={(next) => {
              // SAFETY: the toggle group only emits the values declared in RANGES.
              const selected = next[0] as RangeKey | undefined;

              if (selected) setRange(selected);
            }}
          >
            {RANGES.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Receita do produto"
            value={formatBrl(revenueCents)}
            trend={data.trend.revenue}
            hint="Valor recebido com as vendas deste produto."
            icon={Banknote}
          />
          <KpiCard
            label="Pedidos com o produto"
            value={formatInteger(orders)}
            trend={data.trend.orders}
            hint="Pedidos que incluíram ao menos uma unidade."
            icon={ShoppingCart}
          />
          <KpiCard
            label="Ticket médio do produto"
            value={formatBrl(ticketCents)}
            trend={data.trend.ticket}
            hint="Receita do produto dividida pelos pedidos."
            help="Receita deste produto dividida pelo número de pedidos que o incluíram."
            icon={Receipt}
          />
          <KpiCard
            label="Unidades vendidas"
            value={formatInteger(data.units)}
            trend={data.trend.units}
            hint="Soma das quantidades em todos os pedidos."
            icon={Package}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Clientes únicos"
            value={formatInteger(data.customers)}
            trend={data.trend.customers}
            hint="Quem comprou este produto no período."
            icon={Users}
          />
          <KpiCard
            label="Ticket médio dos compradores"
            value={formatBrl(data.customerTicketCents)}
            trend={data.trend.customerTicket}
            hint="Gasto médio por pedido de quem compra este produto, incluindo os outros itens."
            help="Gasto médio por pedido de quem compra este produto, somando os outros itens do carrinho."
            icon={Wallet}
          />
          <KpiCard
            label="LTV médio dos compradores"
            value={formatBrl(data.ltvCents)}
            trend={data.trend.ltv}
            hint="Gasto acumulado na loja por cliente que já comprou este produto."
            help="LTV (lifetime value) é o gasto acumulado na loja, em média, por cliente que já comprou este produto."
            icon={TrendingUp}
          />
          <KpiCard
            label="Recompra em 90 dias"
            value={formatPercent(data.repeatPct)}
            trend={data.trend.repeat}
            hint="Compradores que voltaram e pediram de novo."
            help="Percentual de compradores que fizeram outro pedido em até 90 dias."
            icon={CalendarCheck}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Participação na receita da loja"
            value={formatPercent(data.revenueSharePct, 1)}
            trend={data.trend.revenueShare}
            hint="Fatia da receita total da loja no período."
            help="Quanto este produto representa da receita total da loja no período selecionado."
            icon={Store}
          />
          <KpiCard
            label="Itens por pedido"
            value={formatDecimal(itemsPerOrder, 1)}
            trend={data.trend.itemsPerOrder}
            hint="Unidades vendidas divididas pelos pedidos."
            help="Média de unidades deste produto por pedido."
            icon={ShoppingBasket}
          />
          <KpiCard
            label="Frequência de compra"
            value={`${formatDecimal(orders / data.customers, 1)}×`}
            trend={data.trend.frequency}
            hint="Pedidos por cliente no período."
            help="Quantos pedidos, em média, cada cliente fez no período."
            icon={Repeat2}
          />
          <KpiCard
            label="Desconto médio"
            value={formatPercent(data.discountPct, 1)}
            trend={data.trend.discount}
            hint="Desconto aplicado sobre o valor dos pedidos com cupom."
            help="Percentual médio de desconto nos pedidos que usaram cupom."
            icon={Percent}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Receita por período</CardTitle>
              <CardDescription>Valores em reais, por período.</CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueChart data={data.series} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Novos e recorrentes</CardTitle>
              <CardDescription>Composição dos compradores no período.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerMix data={data} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Entrega ou retirada</CardTitle>
              <CardDescription>Como os pedidos chegam.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChannelSplit data={data} orders={orders} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Formas de pagamento</CardTitle>
              <CardDescription>
                <span className="flex items-center gap-1">
                  <CreditCard className="size-3.5" aria-hidden="true" />
                  Mix de pagamento no período.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentShares items={data.payments} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Horário de pico</CardTitle>
              <CardDescription>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden="true" />
                  Pedidos por faixa de horário.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PeakHourChart values={data.peakHours} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos por dia da semana</CardTitle>
              <CardDescription>Quando este produto sai.</CardDescription>
            </CardHeader>
            <CardContent>
              <WeekdayChart values={data.weekdays} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quem compra também</CardTitle>
              <CardDescription>
                Itens que entram junto no carrinho nos últimos 90 dias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CrossSellList />
            </CardContent>
          </Card>
        </div>
      </section>
    </TooltipProvider>
  );
}
