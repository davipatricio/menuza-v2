import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { toCouponSummary, redemptionAggregates, type CouponRow } from "./coupon-summary.ts";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listCouponSummaries,
).$context<RequestHeadersHandlerPluginContext>();

/** The store's coupons with their redemption totals, newest code first. */
export const listCouponSummariesImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);
  const now = new Date();

  const coupons = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId })
      .orderBy((coupon) => coupon.code.asc())
      .all(),
  );

  const aggregates = await redemptionAggregates(
    store.tenantId,
    coupons.map((coupon) => coupon.id),
  );

  return {
    coupons: coupons.map((coupon) => toCouponSummary(coupon, aggregates.get(coupon.id), now)),
  };
});

export type ListCouponSummariesImpl = typeof listCouponSummariesImpl;
