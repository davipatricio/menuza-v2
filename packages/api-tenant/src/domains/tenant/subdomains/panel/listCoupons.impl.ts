import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
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
    db.orm.public.Coupon.where({ tenantId: store.tenantId })
      .orderBy((c) => c.code.asc())
      .all(),
  );

  return {
    coupons: coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      valueCents: coupon.discountType === "fixed" ? coupon.value : null,
      valuePercent: coupon.discountType === "percentage" ? coupon.value : null,
      usageCount: coupon.usageCount,
      status: coupon.status,
    })),
  };
});

export type ListCouponsImpl = typeof listCouponsImpl;
