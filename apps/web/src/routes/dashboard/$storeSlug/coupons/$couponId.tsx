import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { COUPON_STATUS_LABELS } from "@/lib/panel-labels.ts";
import type { SearchParams } from "nuqs/server";
import { CouponCrumb } from "@/features/coupons/components/coupon-crumb.tsx";
import { CouponTabs } from "@/features/coupons/components/coupon-tabs.tsx";
import { loadCouponRedemptionSearchParams } from "@/features/coupons/schemas/coupon-search.ts";
import { loadCouponDetailFn } from "@/features/coupons/server/coupon-detail.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

/** One bar, one state: expired beats disabled beats active. */
function statusBar(status: "active" | "expired" | "disabled"): string {
  if (status === "expired") return "bg-destructive";

  if (status === "disabled") return "bg-muted-foreground";

  return "bg-success";
}

export const Route = createFileRoute("/dashboard/$storeSlug/coupons/$couponId")({
  // SAFETY: the router hands back raw query values; the loader narrows them
  // through nuqs, so defaults never land in the URL (no canonicalising 307).
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadCouponRedemptionSearchParams(deps);

    const result = await loadCouponDetailFn({
      data: {
        storeSlug: params.storeSlug,
        couponId: params.couponId,
        q: filters.q,
        sort: filters.sort,
        page: filters.page,
      },
    });

    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    if (result.status === "not-found") throw notFound();

    return result;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: pageTitle(loaderData && "coupon" in loaderData ? loaderData.coupon.code : "Cupom") },
    ],
  }),
  component: CouponDetailPage,
});

function CouponDetailPage() {
  const { storeSlug } = Route.useParams();

  const { coupon, products, redemptions, redemptionsTotal, usage, ordersWithCouponCents } =
    Route.useLoaderData();

  return (
    <CouponCrumb couponId={coupon.id} code={coupon.code}>
      <section aria-labelledby="coupon-detail-heading" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <span
                role="img"
                aria-label={`Status do cupom: ${COUPON_STATUS_LABELS[coupon.effectiveStatus]}`}
                className={`h-6 w-1 shrink-0 rounded-full ${statusBar(coupon.effectiveStatus)}`}
              />
              <h2
                id="coupon-detail-heading"
                className="min-w-0 text-xl font-semibold tracking-tight"
              >
                {coupon.code}
              </h2>
            </div>
            <p className="text-sm text-pretty text-muted-foreground">
              {coupon.description ?? "Cupom sem descrição interna."}
            </p>
          </div>

          <Link
            to="/dashboard/$storeSlug/coupons"
            params={{ storeSlug }}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Voltar para cupons
          </Link>
        </div>

        <CouponTabs
          storeSlug={storeSlug}
          coupon={coupon}
          products={products}
          redemptions={redemptions}
          totalRedemptions={redemptionsTotal}
          usage={usage}
          ordersWithCouponCents={ordersWithCouponCents}
        />
      </section>
    </CouponCrumb>
  );
}
