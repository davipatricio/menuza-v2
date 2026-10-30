import { CalendarCheck, Percent, Receipt, Ticket, Users, Wallet } from "lucide-react";
import type { PanelCouponSummary, PanelCouponUsagePoint } from "@menuza/shared/tenant";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatBrl, formatDateTime, formatDay, formatInteger } from "@/lib/format.ts";
import { COUPON_STATUS_LABELS, COUPON_STATUS_VARIANTS } from "@/lib/panel-labels.ts";

function discountLabel(coupon: PanelCouponSummary): string {
  const base =
    coupon.valuePercent !== null ? `${coupon.valuePercent}%` : formatBrl(coupon.valueCents ?? 0);

  return coupon.shippingDiscountPercent === null
    ? base
    : `${base} + frete ${coupon.shippingDiscountPercent}%`;
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Ticket;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <CardTitle className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground">
          <span className="min-w-0">{label}</span>
        </CardTitle>
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon className="size-3.5" />
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** `2026-10-29` → `29/10`, the axis label the chart prints. */
function bucketLabel(bucket: string): string {
  const [, month, day] = bucket.split("-");

  return `${day}/${month}`;
}

/**
 * CSS bars, no chart dependency: one bucket per day with a redemption, in
 * order. Days without a redemption are absent rather than zero-height, so the
 * gap reads as a gap instead of as a dip to the floor.
 */
function UsageChart({ usage }: { usage: readonly PanelCouponUsagePoint[] }) {
  const max = Math.max(...usage.map((point) => point.redemptions), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label="Resgates por dia, do mais antigo ao mais recente."
          className="flex items-end gap-1.5"
        >
          {usage.map((point) => (
            <div key={point.bucket} className="flex min-w-10 flex-1 flex-col items-center gap-1">
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {formatInteger(point.redemptions)}
              </span>
              <div className="flex h-32 w-full items-end">
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{
                    height: `${Math.max(4, Math.round((point.redemptions / max) * 100))}%`,
                  }}
                  title={`${bucketLabel(point.bucket)}: ${formatInteger(point.redemptions)} resgates · ${formatBrl(point.discountCents)}`}
                />
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {bucketLabel(point.bucket)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {usage.map((point) => (
          <li key={point.bucket}>
            {`${bucketLabel(point.bucket)}: ${formatInteger(point.redemptions)} resgates, ${formatBrl(point.discountCents)} de desconto`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CouponPerformance({
  coupon,
  usage,
  ordersWithCouponCents,
}: {
  coupon: PanelCouponSummary;
  usage: readonly PanelCouponUsagePoint[];
  ordersWithCouponCents: number;
}) {
  const redemptions = coupon.redemptionCount;

  const averageDiscountCents =
    redemptions === 0 ? 0 : Math.round(coupon.discountCents / redemptions);

  const averageOrderCents = redemptions === 0 ? 0 : Math.round(ordersWithCouponCents / redemptions);

  const discountRate =
    ordersWithCouponCents === 0
      ? 0
      : Math.round((coupon.discountCents / ordersWithCouponCents) * 1000) / 10;

  return (
    <section aria-labelledby="coupon-performance-heading" className="flex flex-col gap-6">
      <h3 id="coupon-performance-heading" className="sr-only">
        Desempenho do cupom {coupon.code}
      </h3>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={COUPON_STATUS_VARIANTS[coupon.effectiveStatus]}>
          {COUPON_STATUS_LABELS[coupon.effectiveStatus]}
        </Badge>
        <span className="text-muted-foreground">Desconto de {discountLabel(coupon)}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span className="text-muted-foreground">
          {coupon.usageLimit === null
            ? "Sem limite de uso"
            : `Limite de ${formatInteger(coupon.usageLimit)} usos`}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span className="text-muted-foreground">
          {coupon.perCustomerLimit === null
            ? "Sem limite por cliente"
            : `${formatInteger(coupon.perCustomerLimit)} por cliente`}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Resgates"
          value={formatInteger(redemptions)}
          hint="Pedidos que usaram este cupom."
          icon={Ticket}
        />
        <Kpi
          label="Desconto concedido"
          value={formatBrl(coupon.discountCents)}
          hint="Soma do desconto de todos os resgates."
          icon={Percent}
        />
        <Kpi
          label="Clientes únicos"
          value={formatInteger(coupon.uniqueCustomers)}
          hint="Quantas pessoas diferentes usaram o cupom."
          icon={Users}
        />
        <Kpi
          label="Pedidos com o cupom"
          value={formatBrl(ordersWithCouponCents)}
          hint="Valor total dos pedidos que aplicaram o cupom."
          icon={Receipt}
        />
        <Kpi
          label="Desconto médio"
          value={formatBrl(averageDiscountCents)}
          hint="Desconto concedido dividido pelos resgates."
          icon={Wallet}
        />
        <Kpi
          label="Ticket médio com cupom"
          value={formatBrl(averageOrderCents)}
          hint="Valor médio dos pedidos que usaram o cupom."
          icon={Receipt}
        />
        <Kpi
          label="Peso do desconto"
          value={`${formatInteger(Math.round(discountRate))}%`}
          hint="Quanto o desconto representa do valor desses pedidos."
          icon={Percent}
        />
        <Kpi
          label="Último uso"
          value={coupon.lastRedeemedAt === null ? "—" : formatDateTime(coupon.lastRedeemedAt)}
          hint="Quando o cupom foi aplicado pela última vez."
          icon={CalendarCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resgates por dia</CardTitle>
          <CardDescription>
            Cada barra é um dia com resgate. Dias sem uso não aparecem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Ticket aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Nenhum resgate ainda</EmptyTitle>
                <EmptyDescription>
                  Quando um comprador usar este cupom, o uso aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <UsageChart usage={usage} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Janela de validade</CardTitle>
          <CardDescription>
            A validade é por dia: o cupom vale do início do primeiro dia ao fim do último.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Começa em </span>
            <span className="tabular-nums">
              {coupon.startsAt === null ? "sem data de início" : formatDay(coupon.startsAt)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Termina em </span>
            <span className="tabular-nums">
              {coupon.endsAt === null ? "sem data de término" : formatDay(coupon.endsAt)}
            </span>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
