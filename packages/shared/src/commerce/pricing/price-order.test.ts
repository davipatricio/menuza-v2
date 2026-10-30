import { describe, expect, test } from "bun:test";

import { priceOrder } from "./price-order.ts";
import type { CouponInput, PriceOrderInput } from "./types.ts";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function coupon(overrides: Partial<CouponInput> = {}): CouponInput {
  return {
    id: "coupon-1",
    code: "DEZ",
    discountType: "percentage",
    value: 10,
    minimumOrderCents: null,
    maximumDiscountCents: null,
    shippingDiscountPercent: null,
    startsAt: null,
    endsAt: null,
    stackable: true,
    firstPurchaseOnly: false,
    usageLimit: null,
    perCustomerLimit: null,
    usageCount: 0,
    customerRedemptionCount: 0,
    customerOrderCount: 0,
    status: "active",
    ...overrides,
  };
}

function order(overrides: Partial<PriceOrderInput> = {}): PriceOrderInput {
  return {
    now: NOW,
    lines: [{ unitPriceCents: 1000, quantity: 2 }],
    shippingCents: 0,
    coupons: [],
    walletAvailableCents: 0,
    walletRequestedCents: 0,
    ...overrides,
  };
}

describe("priceOrder: no discounts", () => {
  test("subtotal, shipping and total are exact", () => {
    const result = priceOrder(order({ shippingCents: 700 }));

    expect(result.subtotalCents).toBe(2000);
    expect(result.discountCents).toBe(0);
    expect(result.shippingCents).toBe(700);
    expect(result.walletAppliedCents).toBe(0);
    expect(result.totalCents).toBe(2700);
    expect(result.discounts).toEqual([]);
    expect(result.rejectedCoupons).toEqual([]);
  });

  test("item catalog discounts land in discountCents and keep the money identity", () => {
    const result = priceOrder(
      order({
        lines: [{ unitPriceCents: 1000, quantity: 2, catalogDiscountCents: 300 }],
      }),
    );

    expect(result.subtotalCents).toBe(2000);
    expect(result.discountCents).toBe(300);
    expect(result.totalCents).toBe(1700);
    expect(result.discounts).toEqual([{ source: "item", amountCents: 300 }]);
  });

  test("item catalog discount never discounts past the line itself", () => {
    const result = priceOrder(
      order({ lines: [{ unitPriceCents: 500, quantity: 1, catalogDiscountCents: 900 }] }),
    );

    expect(result.discountCents).toBe(500);
    expect(result.totalCents).toBe(0);
  });
});

describe("priceOrder: percentage coupon", () => {
  test("floors the percentage", () => {
    const result = priceOrder(
      order({ lines: [{ unitPriceCents: 333, quantity: 3 }], coupons: [coupon({ value: 10 })] }),
    );

    // 999 * 10 / 100 = 99.9 -> 99
    expect(result.discountCents).toBe(99);
    expect(result.totalCents).toBe(900);
  });

  test("is capped by maximumDiscountCents", () => {
    const result = priceOrder(
      order({ coupons: [coupon({ value: 50, maximumDiscountCents: 400 })] }),
    );

    // 50% of 2000 = 1000, capped to 400
    expect(result.discountCents).toBe(400);
    expect(result.totalCents).toBe(1600);
  });
});

describe("priceOrder: clamping", () => {
  test("fixed coupon larger than the subtotal clamps to the subtotal", () => {
    const result = priceOrder(
      order({ coupons: [coupon({ discountType: "fixed", value: 99_999 })] }),
    );

    expect(result.subtotalCents).toBe(2000);
    expect(result.discountCents).toBe(2000);
    expect(result.totalCents).toBe(0);
  });
});

describe("priceOrder: rejection reasons", () => {
  test("below minimum order", () => {
    const result = priceOrder(
      order({
        lines: [{ unitPriceCents: 1000, quantity: 1 }],
        coupons: [coupon({ minimumOrderCents: 5000 })],
      }),
    );

    expect(result.discountCents).toBe(0);
    expect(result.rejectedCoupons).toEqual([
      { couponId: "coupon-1", code: "DEZ", reason: "below_minimum" },
    ]);
  });

  test("before startsAt", () => {
    const result = priceOrder(
      order({ coupons: [coupon({ startsAt: new Date("2026-04-01T00:00:00.000Z") })] }),
    );

    expect(result.rejectedCoupons.map((rejected) => rejected.reason)).toEqual(["not_started"]);
  });

  test("after endsAt", () => {
    const result = priceOrder(
      order({ coupons: [coupon({ endsAt: new Date("2026-01-01T00:00:00.000Z") })] }),
    );

    expect(result.rejectedCoupons.map((rejected) => rejected.reason)).toEqual(["expired"]);
  });

  test("disabled status", () => {
    const result = priceOrder(order({ coupons: [coupon({ status: "disabled" })] }));

    expect(result.rejectedCoupons.map((rejected) => rejected.reason)).toEqual(["inactive"]);
    expect(result.discountCents).toBe(0);
  });

  test("usage limit reached", () => {
    const result = priceOrder(order({ coupons: [coupon({ usageLimit: 5, usageCount: 5 })] }));

    expect(result.rejectedCoupons.map((rejected) => rejected.reason)).toEqual(["usage_limit"]);
  });

  test("per customer limit reached", () => {
    const result = priceOrder(
      order({ coupons: [coupon({ perCustomerLimit: 1, customerRedemptionCount: 1 })] }),
    );

    expect(result.rejectedCoupons.map((rejected) => rejected.reason)).toEqual([
      "per_customer_limit",
    ]);
  });

  test("first purchase only, customer already ordered", () => {
    const result = priceOrder(
      order({ coupons: [coupon({ firstPurchaseOnly: true, customerOrderCount: 3 })] }),
    );

    expect(result.rejectedCoupons.map((rejected) => rejected.reason)).toEqual([
      "not_first_purchase",
    ]);
    expect(result.discountCents).toBe(0);
  });
});

describe("priceOrder: stacking (provisional, MEN-98 open)", () => {
  test("a non-stackable coupon loses to a stackable one", () => {
    const result = priceOrder(
      order({
        coupons: [
          coupon({ id: "a", code: "ALONE", stackable: false, value: 50 }),
          coupon({ id: "b", code: "STACK", stackable: true, value: 10 }),
        ],
      }),
    );

    expect(result.rejectedCoupons).toEqual([
      { couponId: "a", code: "ALONE", reason: "not_stackable" },
    ]);
    // Only the stackable 10% applied: 200.
    expect(result.discountCents).toBe(200);
    expect(result.discounts).toEqual([
      { source: "coupon", couponId: "b", couponCode: "STACK", amountCents: 200 },
    ]);
    expect(result.totalCents).toBe(1800);
  });

  test("a lone non-stackable coupon still applies", () => {
    const result = priceOrder(order({ coupons: [coupon({ stackable: false, value: 25 })] }));

    expect(result.discountCents).toBe(500);
    expect(result.rejectedCoupons).toEqual([]);
  });

  test("stackable coupons apply in the given order", () => {
    const result = priceOrder(
      order({
        lines: [{ unitPriceCents: 1000, quantity: 1 }],
        coupons: [
          coupon({ id: "a", code: "FIX", discountType: "fixed", value: 300 }),
          coupon({ id: "b", code: "PCT", value: 10 }),
        ],
      }),
    );

    // fixed 300 first, then 10% of the subtotal (not of the remainder): 100.
    expect(result.discounts).toEqual([
      { source: "coupon", couponId: "a", couponCode: "FIX", amountCents: 300 },
      { source: "coupon", couponId: "b", couponCode: "PCT", amountCents: 100 },
    ]);
    expect(result.discountCents).toBe(400);
  });
});

describe("priceOrder: shipping discount", () => {
  test("applies to shippingCents only", () => {
    const result = priceOrder(
      order({ shippingCents: 1000, coupons: [coupon({ shippingDiscountPercent: 50 })] }),
    );

    // The 10% merchandise discount still applies; shipping drops 1000 -> 500.
    expect(result.discountCents).toBe(200);
    expect(result.shippingCents).toBe(500);
    expect(result.totalCents).toBe(2000 - 200 + 500);
    expect(result.discounts).toContainEqual({
      source: "shipping",
      couponId: "coupon-1",
      couponCode: "DEZ",
      amountCents: 500,
    });
  });

  test("never discounts shipping below zero", () => {
    const result = priceOrder(
      order({
        shippingCents: 900,
        coupons: [
          coupon({ id: "a", code: "S1", shippingDiscountPercent: 80 }),
          coupon({ id: "b", code: "S2", shippingDiscountPercent: 80 }),
        ],
      }),
    );

    expect(result.shippingCents).toBe(0);
  });
});

describe("priceOrder: wallet", () => {
  test("requested above available applies only what is available", () => {
    const result = priceOrder(order({ walletAvailableCents: 500, walletRequestedCents: 2000 }));

    expect(result.walletAppliedCents).toBe(500);
    expect(result.totalCents).toBe(1500);
  });

  test("above the remaining total applies only the remaining total", () => {
    const result = priceOrder(
      order({ walletAvailableCents: 99_999, walletRequestedCents: 99_999, shippingCents: 200 }),
    );

    // 2000 merchandise + 200 freight = 2200 payable.
    expect(result.walletAppliedCents).toBe(2200);
    expect(result.totalCents).toBe(0);
  });

  test("never negative when everything is already free", () => {
    const result = priceOrder(
      order({
        walletAvailableCents: 1000,
        walletRequestedCents: 1000,
        coupons: [coupon({ discountType: "fixed", value: 99_999 })],
      }),
    );

    expect(result.walletAppliedCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });
});

describe("priceOrder: cashback", () => {
  test("excludes freight and wallet from the base", () => {
    const result = priceOrder(
      order({
        shippingCents: 5000,
        walletAvailableCents: 500,
        walletRequestedCents: 500,
        cashbackPercent: 10,
        coupons: [coupon({ value: 10 })],
      }),
    );

    // Net merchandise 2000 - 200 = 1800; 10% = 180. Freight and wallet ignored.
    expect(result.cashbackCents).toBe(180);
  });

  test("is zero without a cashback percent", () => {
    expect(priceOrder(order()).cashbackCents).toBe(0);
  });
});

describe("priceOrder: invariants", () => {
  test("totalCents is never negative", () => {
    const cases: PriceOrderInput[] = [
      order(),
      order({ coupons: [coupon({ discountType: "fixed", value: 99_999 })] }),
      order({
        coupons: [coupon({ discountType: "fixed", value: 99_999, shippingDiscountPercent: 100 })],
        walletAvailableCents: 99_999,
        walletRequestedCents: 99_999,
      }),
      order({ lines: [{ unitPriceCents: 0, quantity: 0 }] }),
    ];

    for (const input of cases) {
      expect(priceOrder(input).totalCents).toBeGreaterThanOrEqual(0);
    }
  });

  test("throws RangeError on negative or fractional money", () => {
    expect(() => priceOrder(order({ shippingCents: -1 }))).toThrow(RangeError);
    expect(() => priceOrder(order({ walletAvailableCents: -1 }))).toThrow(RangeError);
    expect(() => priceOrder(order({ lines: [{ unitPriceCents: 10.5, quantity: 1 }] }))).toThrow(
      RangeError,
    );
    expect(() => priceOrder(order({ coupons: [coupon({ value: -10 })] }))).toThrow(RangeError);
  });
});
