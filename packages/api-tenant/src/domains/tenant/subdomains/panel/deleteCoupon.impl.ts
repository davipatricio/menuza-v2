import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(tenantContractObject.panel.deleteCoupon).$context<RequestHeadersHandlerPluginContext>();

export const deleteCouponImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);
  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).first(),
  );
  if (!existing) throw notFound();
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).delete(),
  );
  return { success: true };
});

export type DeleteCouponImpl = typeof deleteCouponImpl;
