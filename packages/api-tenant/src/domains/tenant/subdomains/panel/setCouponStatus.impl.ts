import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { and, db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { resolveCouponStatus } from "./coupon-status.ts";
import { validationFailed } from "./paymentSupport.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.setCouponStatus,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The switch writes the stored status only: the window columns are the form's,
 * so a status change cannot move a coupon's dates.
 *
 * `expired` is derived on the `active` path, exactly as `updateCoupon` derives
 * it. A coupon whose `endsAt` has already passed cannot be turned back on — the
 * row would say `active` while the read path says `expired` — so activation is
 * refused instead of quietly storing a status the coupon cannot honour. An
 * explicit disable is written as `disabled`, because the read path derives
 * `expired` from the window: a stored `disabled` stays `disabled`.
 */
export const setCouponStatusImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  // A soft-deleted coupon is history: it cannot be switched back on.
  const coupon = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where((row) =>
      and(row.tenantId.eq(store.tenantId), row.id.eq(input.couponId), row.deletedAt.eq(null)),
    ).first(),
  );

  if (!coupon) throw notFound();

  // `String` keeps the column UTC-naive: `resolveCouponStatus` reads a wall
  // clock and would throw on the `Z` the panel wire format carries.
  const status =
    input.status === "disabled"
      ? "disabled"
      : resolveCouponStatus({
          requested: input.status,
          endsAt: coupon.endsAt == null ? null : String(coupon.endsAt),
          now: new Date(),
        });

  if (input.status === "active" && status === "expired") {
    throw validationFailed("O cupom já expirou: ajuste a data de término para ativá-lo.");
  }

  // `updateAll`, not `update`: the planner compiles `update` from
  // `where({ tenantId, id })` down to `id` only, and the isolation guard then
  // rejects the write.
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({
      tenantId: store.tenantId,
      id: input.couponId,
    }).updateAll({ status }),
  );

  return { success: true };
});

export type SetCouponStatusImpl = typeof setCouponStatusImpl;
