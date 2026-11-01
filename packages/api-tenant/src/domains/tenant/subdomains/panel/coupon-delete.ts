/**
 * The delete rule shared by `deleteCoupon` and `bulkDeleteCoupons`.
 *
 * A coupon an order or a redemption still names is history, not a draft.
 * Hard-deleting it would cascade `CouponRedemption` away and null
 * `Order.couponId`, so the discount the store granted would vanish from its own
 * books. Those rows are archived instead — `deletedAt` stamped and the status
 * forced to `disabled` — which stops the coupon applying while the ledger stays
 * readable. A coupon nothing points at is removed for good.
 *
 * The decision runs inside the caller's transaction, so the link check and the
 * write cannot disagree, and a bulk call rolls back whole when one id is not the
 * store's.
 */
import { and, type DbTransaction } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { now } from "./taxonomy.ts";

/** What one deletion did, so a caller can count the archived rows. */
export type CouponDeleteOutcome = "deleted" | "archived";

/**
 * Deletes or archives one coupon. `deletedAt` is part of the lookup: an archived
 * coupon is already gone, so a repeated delete is `NOT_FOUND` rather than a
 * second archive.
 */
export async function deleteCouponRow(
  tx: DbTransaction,
  tenantId: string,
  couponId: string,
): Promise<CouponDeleteOutcome> {
  const coupon = await tx.orm.public.Coupon.where((row) =>
    and(row.tenantId.eq(tenantId), row.id.eq(couponId), row.deletedAt.eq(null)),
  ).first();

  if (!coupon) throw notFound();

  if (await couponIsLinked(tx, tenantId, couponId)) {
    await tx.orm.public.Coupon.where((row) =>
      and(row.tenantId.eq(tenantId), row.id.eq(couponId)),
    ).updateAll({ deletedAt: now(), status: "disabled" });

    return "archived";
  }

  // `deleteAll`, not `delete`: the planner compiles `delete` from a unique key
  // down to `id` only, and the isolation guard then rejects the write.
  await tx.orm.public.Coupon.where((row) =>
    and(row.tenantId.eq(tenantId), row.id.eq(couponId)),
  ).deleteAll();

  return "deleted";
}

/** An order or a redemption that names the coupon keeps it on the books. */
async function couponIsLinked(
  tx: DbTransaction,
  tenantId: string,
  couponId: string,
): Promise<boolean> {
  const redemption = await tx.orm.public.CouponRedemption.where({ tenantId, couponId }).first();

  if (redemption) return true;

  const order = await tx.orm.public.Order.where((row) =>
    and(row.tenantId.eq(tenantId), row.couponId.eq(couponId)),
  ).first();

  return order !== null;
}
