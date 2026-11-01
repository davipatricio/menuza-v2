import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COUPON_STATUS_LABELS } from "@/lib/panel-labels.ts";
import { panelClient } from "@/lib/server-tenant.ts";
import { SimpleLoading } from "../../_components/simple-loading.tsx";
import {
  loadCouponRedemptionSearchParams,
  REDEMPTION_PAGE_SIZE,
  type CouponRedemptionSearchParams,
} from "../coupon-search-params.ts";
import type { ProductOption } from "../coupon-product-picker.tsx";
import { CouponCrumb } from "./coupon-crumb.tsx";
import { CouponTabs } from "./coupon-tabs.tsx";

export const instant = true;

type CouponDetailPageProps = {
  params: Promise<{ storeSlug: string; couponId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CouponDetailPage({ params, searchParams }: CouponDetailPageProps) {
  return (
    <Suspense fallback={<SimpleLoading label="Carregando cupom" />}>
      <CouponDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Coupon, redemptions and usage series in one round trip; any error is a 404. */
async function loadCoupon(
  storeSlug: string,
  couponId: string,
  filters: CouponRedemptionSearchParams,
) {
  const client = await panelClient();

  if (!client) return null;

  try {
    return await client.panel.getCouponDetail({
      storeSlug,
      couponId,
      search: filters.q.trim() === "" ? undefined : filters.q.trim(),
      sort: filters.sort,
      page: filters.page,
      pageSize: REDEMPTION_PAGE_SIZE,
    });
  } catch {
    return null;
  }
}

/**
 * The scope picker's options: one catalog read. A failing read leaves the picker
 * with the coupon's own products instead of failing the whole detail page.
 */
async function loadProductOptions(storeSlug: string) {
  const client = await panelClient();

  if (!client) return [];

  try {
    const { products } = await client.panel.listProducts({ storeSlug });

    return products.map((product) => ({ id: product.id, name: product.name }));
  } catch {
    return [];
  }
}

/** Selected products lead the list, with the names the detail read already supplied. */
function withScopedProducts(scoped: readonly ProductOption[], products: ProductOption[]) {
  const seen = new Set(scoped.map((product) => product.id));

  return [...scoped, ...products.filter((product) => !seen.has(product.id))];
}

/** One bar, one state: expired wins, then disabled, then active. */
function couponStatusBar(effectiveStatus: "active" | "expired" | "disabled") {
  if (effectiveStatus === "expired") return "bg-destructive";

  if (effectiveStatus === "disabled") return "bg-muted-foreground";

  return "bg-success";
}

async function CouponDetail({ params, searchParams }: CouponDetailPageProps) {
  const { storeSlug, couponId } = await params;

  // The URL decides what the history read asks for, so it is resolved first.
  const [filters, productOptions] = await Promise.all([
    loadCouponRedemptionSearchParams(searchParams),
    loadProductOptions(storeSlug),
  ]);

  const detail = await loadCoupon(storeSlug, couponId, filters);

  if (!detail) notFound();

  const { coupon } = detail;
  const products = withScopedProducts(detail.products ?? [], productOptions);

  return (
    <CouponCrumb couponId={coupon.id} code={coupon.code}>
      <section aria-labelledby="coupon-detail-heading" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              role="img"
              aria-label={`Status do cupom: ${COUPON_STATUS_LABELS[coupon.effectiveStatus]}`}
              className={`h-6 w-1 shrink-0 rounded-full ${couponStatusBar(coupon.effectiveStatus)}`}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2
                id="coupon-detail-heading"
                className="min-w-0 text-xl font-semibold tracking-tight"
              >
                {coupon.code}
              </h2>
              <p className="text-sm text-pretty text-muted-foreground">
                {coupon.description ?? "Cupom sem descrição interna."}
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/${storeSlug}/coupons`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Voltar para cupons
          </Link>
        </div>

        <CouponTabs
          storeSlug={storeSlug}
          coupon={coupon}
          products={products}
          redemptions={detail.redemptions}
          totalRedemptions={detail.redemptionsTotal}
          usage={detail.usage}
          ordersWithCouponCents={detail.ordersWithCouponCents}
        />
      </section>
    </CouponCrumb>
  );
}
