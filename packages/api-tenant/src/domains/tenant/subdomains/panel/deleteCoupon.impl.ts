import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.deleteCoupon,
).$context<RequestHeadersHandlerPluginContext>();

export const deleteCouponImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).first(),
  );

  if (!existing) throw notFound();

  // A coupon that was already used is history, not a draft. Deleting it would
  // cascade `CouponRedemption` away and null `Order.couponId`, so the discount
  // the store granted would vanish from its own books. It is disabled instead:
  // it stops applying, and every redemption it earned stays readable.
  const redeemed = await inTenantScope(store.tenantId, () =>
    db.orm.public.CouponRedemption.where({ tenantId: store.tenantId, couponId: input.couponId })
      .aggregate((aggregate) => ({ count: aggregate.count() }))
      .then((count) => count.count),
  );

  if (redeemed > 0) {
    await inTenantScope(store.tenantId, () =>
      db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).updateAll({
        status: "disabled",
      }),
    );

    return { success: true, archived: true as const };
  }

  // `deleteAll`, not `delete`: the planner compiles `delete` from
  // `where({ tenantId, id })` down to `id` only, and the isolation guard then
  // rejects the write.
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).deleteAll(),
  );

  return { success: true, archived: false as const };
});

export type DeleteCouponImpl = typeof deleteCouponImpl;
