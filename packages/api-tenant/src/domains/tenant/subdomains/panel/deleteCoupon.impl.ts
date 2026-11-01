import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { deleteCouponRow } from "./coupon-delete.ts";

const os = implement(
  tenantContractObject.panel.deleteCoupon,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * One transaction: the ownership lookup, the link check and the write either
 * agree or none of them happen. The rule itself — archive when an order or a
 * redemption names the coupon, delete when nothing does — lives in
 * `coupon-delete.ts`, shared with the bulk procedure.
 */
export const deleteCouponImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const outcome = await inTenantScope(store.tenantId, () =>
    db.transaction((tx) => deleteCouponRow(tx, store.tenantId, input.couponId)),
  );

  return { success: true, archived: outcome === "archived" };
});

export type DeleteCouponImpl = typeof deleteCouponImpl;
