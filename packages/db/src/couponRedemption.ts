/**
 * The ledger side of a coupon: the rows that record a use, and the counter that
 * a limit reads.
 *
 * A coupon is spent when it is applied at checkout, but an order cancelled or
 * expired unpaid never earned the store anything: keeping the redemption would
 * burn a `usageLimit` slot and block the customer's `perCustomerLimit` on a
 * purchase that did not happen. Money already received is different — a paid,
 * refunded or cancelled-after-payment order did redeem the coupon, and its
 * redemption stays so the discount shows in the store's books. That decision is
 * `releasesCoupon` in `@menuza/shared/commerce`; this only carries it out.
 *
 * Both the commerce checkout and the dashboard order actions call it, which is
 * why it lives here rather than in either API package.
 */
import type { DbTransaction } from "./client.ts";

export async function releaseCouponRedemptions(
  tx: DbTransaction,
  tenantId: string,
  orderId: string,
): Promise<void> {
  const redemptions = await tx.orm.public.CouponRedemption.where({ tenantId, orderId }).all();

  for (const redemption of redemptions) {
    // The coupon row is locked before the counter moves, exactly as
    // `applyCoupons` locks it, so two concurrent releases on the same coupon
    // serialize instead of both reading the same count.
    const locked = await tx.orm.public.Coupon.where({
      tenantId,
      id: redemption.couponId,
    })
      .forUpdate()
      .first();

    await tx.orm.public.CouponRedemption.where({ tenantId, id: redemption.id }).deleteAll();

    if (!locked) continue;

    await tx.orm.public.Coupon.where({ tenantId, id: locked.id }).updateAll({
      usageCount: Math.max(0, locked.usageCount - 1),
    });
  }
}
