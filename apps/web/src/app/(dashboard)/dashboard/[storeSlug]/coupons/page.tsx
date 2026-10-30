import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ticket, Plus } from "lucide-react";
import type { PanelCouponSummary } from "@menuza/shared/tenant";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { formatBrl, formatInteger } from "@/lib/format.ts";
import { panelClient } from "@/lib/server-tenant.ts";
import { TableLoading } from "../_components/table-loading.tsx";
import { filterCoupons } from "./coupon-filter.ts";
import { loadCouponSearchParams } from "./coupon-search-params.ts";
import { CouponsTable } from "./coupons-table.tsx";

// Uncached, like the products list: `router.refresh()` after a save clears only
// the current route's client cache, so a TTL would show the user a stale row.
export const instant = true;

export default function CouponsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando cupons" />}>
      <Coupons params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Active count, redemptions and the money granted, all from the one payload. */
function totals(coupons: readonly PanelCouponSummary[]) {
  const redemptions = coupons.reduce((sum, coupon) => sum + coupon.redemptionCount, 0);
  const discountCents = coupons.reduce((sum, coupon) => sum + coupon.discountCents, 0);

  return {
    active: coupons.filter((coupon) => coupon.effectiveStatus === "active").length,
    redemptions,
    discountCents,
    averageCents: redemptions === 0 ? 0 : Math.round(discountCents / redemptions),
  };
}

async function Coupons({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeSlug }, filters, client] = await Promise.all([
    params,
    loadCouponSearchParams(searchParams),
    panelClient(),
  ]);

  if (!client) notFound();

  const { coupons } = await client.panel.listCouponSummaries({ storeSlug });

  const filtered = filterCoupons(coupons, filters);
  const stats = totals(coupons);

  return (
    <section aria-labelledby="coupons-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="coupons-heading" className="text-xl font-semibold tracking-tight">
            Cupons
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie cupons promocionais, limites de uso e validade.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/dashboard/${storeSlug}/coupons/new`} aria-label="Novo cupom" />}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Novo cupom
        </Button>
      </div>

      {coupons.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Ticket aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum cupom cadastrado</EmptyTitle>
            <EmptyDescription>
              Crie o primeiro cupom para oferecer desconto no checkout da loja.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/dashboard/${storeSlug}/coupons/new`}
                  aria-label="Criar primeiro cupom"
                />
              }
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Criar primeiro cupom
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Cupons ativos"
              value={formatInteger(stats.active)}
              hint="Válidos hoje, dentro da janela de uso."
            />
            <StatCard
              label="Resgates"
              value={formatInteger(stats.redemptions)}
              hint="Pedidos que usaram um cupom."
            />
            <StatCard
              label="Desconto concedido"
              value={formatBrl(stats.discountCents)}
              hint="Soma do desconto de todos os resgates."
            />
            <StatCard
              label="Desconto médio por resgate"
              value={formatBrl(stats.averageCents)}
              hint="Desconto concedido dividido pelos resgates."
            />
          </div>

          <CouponsTable
            storeSlug={storeSlug}
            coupons={filtered}
            storeCoupons={coupons}
            totalCount={coupons.length}
          />
        </>
      )}
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
