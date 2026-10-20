/**
 * Types for the pure order-pricing engine (MEN-97 / MEN-98).
 *
 * Type-only: the engine is internal and browser-safe. Every value that later
 * crosses a contract boundary is validated by Valibot in the contract that
 * carries it; these types never reach the wire by themselves.
 *
 * Money is integer cents everywhere (ADR-0006). Timestamps are real `Date`s
 * because the engine stays pure and reads `now` from its input.
 */

/** One cart line as the catalog priced it, before coupons. */
export interface PriceLineInput {
  unitPriceCents: number;
  /** Positive count; `0` is tolerated and contributes nothing. */
  quantity: number;
  /** Per-line catalog markdown already decided by the catalog (menu price, promotion). */
  catalogDiscountCents?: number;
}

/**
 * The narrow slice of a `Coupon` row the engine reads. Deliberately not the ORM
 * row: the caller maps the row (plus the customer's counters) into this shape.
 */
export interface CouponInput {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  /** Whole percent when `percentage`, cents when `fixed`. */
  value: number;
  minimumOrderCents: number | null;
  maximumDiscountCents: number | null;
  /** Extra percent off the shipping fee; independent of `discountType`. */
  shippingDiscountPercent: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  stackable: boolean;
  firstPurchaseOnly: boolean;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usageCount: number;
  customerRedemptionCount: number;
  /** Previous orders of this customer; `0` means first purchase. */
  customerOrderCount: number;
  status: "active" | "expired" | "disabled";
  /**
   * Delivery modes the coupon is limited to, when the store configured any.
   * Absent or empty means every mode.
   */
  deliveryModes?: readonly string[];
}

export interface PriceOrderInput {
  /** Injected clock: the engine is deterministic on this value. */
  now: Date;
  lines: PriceLineInput[];
  shippingCents: number;
  deliveryMode?: string;
  coupons: CouponInput[];
  walletAvailableCents: number;
  walletRequestedCents: number;
  cashbackPercent?: number;
}

export interface AppliedDiscount {
  source: "item" | "coupon" | "shipping" | "wallet";
  /** Present for `source: "coupon"` and `source: "shipping"` (rejected? no — applied). */
  couponId?: string;
  couponCode?: string;
  amountCents: number;
}

export interface RejectedCoupon {
  couponId: string;
  code: string;
  reason:
    | "inactive"
    | "not_started"
    | "expired"
    | "below_minimum"
    | "usage_limit"
    | "per_customer_limit"
    | "not_first_purchase"
    | "not_stackable"
    | "delivery_mode";
}

export interface PriceOrderResult {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  walletAppliedCents: number;
  totalCents: number;
  cashbackCents: number;
  discounts: AppliedDiscount[];
  rejectedCoupons: RejectedCoupon[];
}
