import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { and, db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listCoupons,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's coupons. `value` is one Int column with two meanings — cents for
 * a fixed discount, whole percent for a percentage one — so it is split here
 * into two nullable fields and the UI never re-interprets it (ADR-0006, MEN-97).
 */
export const listCouponsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const coupons = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where((coupon) =>
      and(coupon.tenantId.eq(store.tenantId), coupon.deletedAt.eq(null)),
    )
      .include("products", (link) => link.select("productId"))
      .orderBy((c) => c.code.asc())
      .all(),
  );

  return {
    coupons: coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description ?? null,
      discountType: coupon.discountType,
      valueCents: coupon.discountType === "fixed" ? coupon.value : null,
      valuePercent: coupon.discountType === "percentage" ? coupon.value : null,
      usageCount: coupon.usageCount,
      usageLimit: coupon.usageLimit ?? null,
      perCustomerLimit: coupon.perCustomerLimit ?? null,
      minimumOrderCents: coupon.minimumOrderCents ?? null,
      maximumDiscountCents: coupon.maximumDiscountCents ?? null,
      shippingDiscountPercent: coupon.shippingDiscountPercent ?? null,
      startsAt: coupon.startsAt == null ? null : String(coupon.startsAt),
      endsAt: coupon.endsAt == null ? null : String(coupon.endsAt),
      stackable: Boolean(coupon.stackable),
      firstPurchaseOnly: Boolean(coupon.firstPurchaseOnly),
      status: coupon.status,
      // Same normalization as the writes: anything but `exclude` reads as `include`.
      productScopeMode:
        coupon.productScopeMode === "exclude" ? ("exclude" as const) : ("include" as const),
      productIds: (coupon.products ?? []).map((link) => link.productId),
    })),
  };
});

export type ListCouponsImpl = typeof listCouponsImpl;
