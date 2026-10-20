/**
 * Pure order-pricing engine (MEN-97, MEN-98).
 *
 * No I/O, no clock reads, no DB: everything the calculation needs — including
 * `now` — comes in the input, so the same input always prices the same order.
 *
 * PROVISIONAL ORDER. MEN-98 (coupon stacking and precedence) is still open, so
 * the sequence below is the working assumption, not the final rule:
 *
 * 1. Line total is `unitPriceCents * quantity`; `catalogDiscountCents` is
 *    reported as an item discount, so `subtotalCents` stays the gross
 *    merchandise value and the money identity of `Order` holds:
 *    `total = subtotal - discount + shipping`.
 * 2. Item and coupon discounts are summed into `discountCents`. Because the
 *    item discount is not netted off the subtotal, it is never counted twice.
 * 3. Coupons: a non-stackable coupon applies **alone** — when more than one
 *    coupon is applicable the non-stackable ones are rejected as
 *    `not_stackable` and the stackable ones apply in the order given. A rejected
 *    coupon contributes 0. Percentage discounts floor on the subtotal, fixed ones
 *    are taken as-is; both are capped by `maximumDiscountCents` and clamped to the
 *    remaining merchandise so the total can never go negative.
 * 4. Shipping discount: `floor(shipping * shippingDiscountPercent / 100)` of the
 *    applied coupons, off `shippingCents` only, never merchandising. The result's
 *    `shippingCents` is the net freight actually charged.
 * 5. Wallet: `min(requested, available, remaining total)`, never negative.
 * 6. `totalCents = subtotal - discount + shipping - wallet`, clamped at 0.
 * 7. Cashback: `floor(max(0, subtotal - discount) * percent / 100)` — net
 *    merchandise only, before freight and before wallet.
 *
 * Money is integer cents everywhere (ADR-0006): `Math.floor` only, never floats
 * or `toFixed`. A negative input is a programming error, hence `RangeError`.
 */
import type {
  AppliedDiscount,
  CouponInput,
  PriceOrderInput,
  PriceOrderResult,
  RejectedCoupon,
} from "./types.ts";

export function priceOrder(input: PriceOrderInput): PriceOrderResult {
  const { now, lines, coupons } = input;

  assertCents("shippingCents", input.shippingCents);
  assertCents("walletAvailableCents", input.walletAvailableCents);
  assertCents("walletRequestedCents", input.walletRequestedCents);
  assertNonNegative("cashbackPercent", input.cashbackPercent ?? 0);

  const discounts: AppliedDiscount[] = [];

  let subtotalCents = 0;
  let discountCents = 0;

  for (const line of lines) {
    assertCents("unitPriceCents", line.unitPriceCents);
    assertCount("quantity", line.quantity);

    const gross = line.unitPriceCents * line.quantity;
    const itemDiscount = line.catalogDiscountCents ?? 0;
    assertCents("catalogDiscountCents", itemDiscount);

    // Stale catalog data clamps instead of throwing: an item never discounts
    // below zero and the order still prices.
    const applied = Math.min(itemDiscount, gross);

    subtotalCents += gross;
    discountCents += applied;

    if (applied > 0) discounts.push({ source: "item", amountCents: applied });
  }

  const applicable: CouponInput[] = [];
  const rejectedCoupons: RejectedCoupon[] = [];

  for (const coupon of coupons) {
    assertCoupon(coupon);

    const reason = ineligibility(coupon, subtotalCents, input.deliveryMode, now);

    if (reason === null) {
      applicable.push(coupon);
      continue;
    }

    rejectedCoupons.push({ couponId: coupon.id, code: coupon.code, reason });
  }

  // Provisional precedence (MEN-98): stackable coupons win, a non-stackable one
  // only ever applies when it is the only applicable coupon.
  const applying =
    applicable.length > 1 ? applicable.filter((coupon) => coupon.stackable) : applicable;

  if (applicable.length > 1) {
    for (const coupon of applicable) {
      if (!coupon.stackable) {
        rejectedCoupons.push({ couponId: coupon.id, code: coupon.code, reason: "not_stackable" });
      }
    }
  }

  let shippingCents = input.shippingCents;

  for (const coupon of applying) {
    const raw =
      coupon.discountType === "percentage"
        ? Math.floor((subtotalCents * coupon.value) / 100)
        : coupon.value;

    const capped =
      coupon.maximumDiscountCents === null ? raw : Math.min(raw, coupon.maximumDiscountCents);

    const amountCents = Math.min(Math.max(0, capped), Math.max(0, subtotalCents - discountCents));

    if (amountCents > 0) {
      discountCents += amountCents;
      discounts.push({
        source: "coupon",
        couponId: coupon.id,
        couponCode: coupon.code,
        amountCents,
      });
    }

    if (coupon.shippingDiscountPercent !== null) {
      // Percentage of the fee as quoted, clamped by whatever freight is left, so
      // stacking two shipping coupons cannot discount past zero.
      const shippingDiscount = Math.min(
        Math.floor((input.shippingCents * coupon.shippingDiscountPercent) / 100),
        shippingCents,
      );

      if (shippingDiscount > 0) {
        shippingCents -= shippingDiscount;
        discounts.push({
          source: "shipping",
          couponId: coupon.id,
          couponCode: coupon.code,
          amountCents: shippingDiscount,
        });
      }
    }
  }

  const payable = subtotalCents - discountCents + shippingCents;

  const walletAppliedCents = Math.max(
    0,
    Math.min(input.walletRequestedCents, input.walletAvailableCents, payable),
  );

  if (walletAppliedCents > 0) {
    discounts.push({ source: "wallet", amountCents: walletAppliedCents });
  }

  const totalCents = Math.max(0, payable - walletAppliedCents);

  const netMerchandise = Math.max(0, subtotalCents - discountCents);
  const cashbackCents = Math.floor((netMerchandise * (input.cashbackPercent ?? 0)) / 100);

  return {
    subtotalCents,
    discountCents,
    shippingCents,
    walletAppliedCents,
    totalCents,
    cashbackCents,
    discounts,
    rejectedCoupons,
  };
}

function ineligibility(
  coupon: CouponInput,
  subtotalCents: number,
  deliveryMode: string | undefined,
  now: Date,
): RejectedCoupon["reason"] | null {
  if (coupon.status !== "active") return "inactive";

  if (coupon.startsAt !== null && now.getTime() < coupon.startsAt.getTime()) return "not_started";

  if (coupon.endsAt !== null && now.getTime() > coupon.endsAt.getTime()) return "expired";

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return "usage_limit";

  if (
    coupon.perCustomerLimit !== null &&
    coupon.customerRedemptionCount >= coupon.perCustomerLimit
  ) {
    return "per_customer_limit";
  }

  if (coupon.firstPurchaseOnly && coupon.customerOrderCount > 0) return "not_first_purchase";

  if (coupon.minimumOrderCents !== null && subtotalCents < coupon.minimumOrderCents) {
    return "below_minimum";
  }

  if (
    coupon.deliveryModes !== undefined &&
    coupon.deliveryModes.length > 0 &&
    (deliveryMode === undefined || !coupon.deliveryModes.includes(deliveryMode))
  ) {
    return "delivery_mode";
  }

  return null;
}

function assertCoupon(coupon: CouponInput): void {
  assertCents("coupon.value", coupon.value);
  assertCount("coupon.usageCount", coupon.usageCount);
  assertCount("coupon.customerRedemptionCount", coupon.customerRedemptionCount);
  assertCount("coupon.customerOrderCount", coupon.customerOrderCount);

  if (coupon.minimumOrderCents !== null) {
    assertCents("coupon.minimumOrderCents", coupon.minimumOrderCents);
  }

  if (coupon.maximumDiscountCents !== null) {
    assertCents("coupon.maximumDiscountCents", coupon.maximumDiscountCents);
  }

  if (coupon.usageLimit !== null) assertCount("coupon.usageLimit", coupon.usageLimit);

  if (coupon.perCustomerLimit !== null)
    assertCount("coupon.perCustomerLimit", coupon.perCustomerLimit);

  if (coupon.shippingDiscountPercent !== null) {
    assertNonNegative("coupon.shippingDiscountPercent", coupon.shippingDiscountPercent);
  }
}

function assertCents(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer of cents, got ${value}`);
  }
}

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number, got ${value}`);
  }
}
