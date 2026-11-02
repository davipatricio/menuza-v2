import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { SearchParams } from "nuqs/server";
import { Plus, Ticket } from "lucide-react";
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
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { CouponsTable } from "@/features/coupons/components/coupons-table.tsx";
import { filterCoupons } from "@/features/coupons/lib/coupon-filter.ts";
import { loadCouponSearchParams } from "@/features/coupons/schemas/coupon-search.ts";
import { listCouponSummariesFn } from "@/features/coupons/server/list-coupons.functions.ts";
import { formatBrl, formatInteger } from "@/lib/format.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/coupons/")({
  // SAFETY: raw query values in; the loader parses them through nuqs so defaults
  // never land in the URL (which would trigger a canonicalising redirect).
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadCouponSearchParams(deps);
    const payload = await listCouponSummariesFn({ data: { storeSlug: params.storeSlug } });

    // No panel session: the layout resolved the store, so signing in again recovers.
    if (!payload) throw redirect({ href: "/dashboard/login" });

    return {
      coupons: filterCoupons(payload.coupons, filters),
      storeCoupons: payload.coupons,
    };
  },
  pendingComponent: () => <TableLoading label="Carregando cupons" />,
  head: () => ({ meta: [{ title: pageTitle("Cupons") }] }),
  component: CouponsPage,
});

/** Active count, redemptions and the money granted, all from the one payload. */
function totals(
  coupons: readonly { effectiveStatus: string; redemptionCount: number; discountCents: number }[],
) {
  const redemptions = coupons.reduce((sum, coupon) => sum + coupon.redemptionCount, 0);
  const discountCents = coupons.reduce((sum, coupon) => sum + coupon.discountCents, 0);

  return {
    active: coupons.filter((coupon) => coupon.effectiveStatus === "active").length,
    redemptions,
    discountCents,
    averageCents: redemptions === 0 ? 0 : Math.round(discountCents / redemptions),
  };
}

function CouponsPage() {
  const { storeSlug } = Route.useParams();
  const { coupons, storeCoupons } = Route.useLoaderData();
  const stats = totals(storeCoupons);

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
          render={
            <Link to="/dashboard/$storeSlug/coupons/new" params={{ storeSlug }} preload="intent" />
          }
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Novo cupom
        </Button>
      </div>

      {storeCoupons.length === 0 ? (
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
              render={
                <Link
                  to="/dashboard/$storeSlug/coupons/new"
                  params={{ storeSlug }}
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

          <CouponsTable storeSlug={storeSlug} coupons={coupons} totalCount={storeCoupons.length} />
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
