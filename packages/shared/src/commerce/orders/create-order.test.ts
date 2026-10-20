import { describe, expect, test } from "bun:test";

import { priceOrder } from "../pricing/price-order.ts";
import type { CouponInput, PriceOrderInput } from "../pricing/types.ts";
import { createOrder } from "./create-order.ts";
import type { CreateOrderInput } from "./types.ts";

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

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    now: NOW,
    lines: [{ unitPriceCents: 1000, quantity: 2 }],
    shippingCents: 0,
    coupons: [],
    walletAvailableCents: 0,
    walletRequestedCents: 0,
    paymentMethod: null,
    ...overrides,
  };
}

function priced(overrides: Partial<CreateOrderInput> = {}): PriceOrderInput {
  const { paymentMethod: _paymentMethod, ...rest } = input(overrides);

  return rest;
}

describe("createOrder: initial status", () => {
  test("pay on delivery starts at pending_on_delivery and never expires", () => {
    for (const paymentMethod of ["cash_on_delivery", "card_on_delivery"] as const) {
      const result = createOrder(input({ paymentMethod }));

      expect(result.financialStatus).toBe("pending_on_delivery");
      expect(result.fulfilmentStatus).toBe("pending");
      expect(result.expiresAt).toBeNull();
    }
  });

  test("pix starts at awaiting_payment and expires in 24h", () => {
    const result = createOrder(input({ paymentMethod: "pix" }));

    expect(result.financialStatus).toBe("awaiting_payment");
    expect(result.fulfilmentStatus).toBe("pending");
    expect(result.expiresAt).toEqual(new Date("2026-03-11T12:00:00.000Z"));
  });

  test("every up-front method awaits payment", () => {
    for (const paymentMethod of [
      "pix",
      "credit",
      "debit",
      "meal_voucher",
      "food_voucher",
    ] as const) {
      const result = createOrder(input({ paymentMethod }));

      expect(result.financialStatus).toBe("awaiting_payment");
      expect(result.expiresAt).not.toBeNull();
    }
  });

  test("no method yet starts at pending without expiry", () => {
    const result = createOrder(input({ paymentMethod: null }));

    expect(result.financialStatus).toBe("pending");
    expect(result.fulfilmentStatus).toBe("pending");
    expect(result.expiresAt).toBeNull();
  });
});

describe("createOrder: money", () => {
  test("matches priceOrder field by field", () => {
    const args = input({
      paymentMethod: "pix",
      shippingCents: 700,
      coupons: [coupon()],
      walletAvailableCents: 5000,
      walletRequestedCents: 800,
      cashbackPercent: 5,
    });

    const reported = createOrder(args);
    const expected = priceOrder(priced(args));

    expect(reported.subtotalCents).toBe(expected.subtotalCents);
    expect(reported.discountCents).toBe(expected.discountCents);
    expect(reported.shippingCents).toBe(expected.shippingCents);
    expect(reported.walletAppliedCents).toBe(expected.walletAppliedCents);
    expect(reported.totalCents).toBe(expected.totalCents);
    expect(reported.cashbackCents).toBe(expected.cashbackCents);
    expect(reported.discounts).toEqual(expected.discounts);
    expect(reported.rejectedCoupons).toEqual(expected.rejectedCoupons);
  });

  test("keeps the rejected coupons", () => {
    const result = createOrder(
      input({ coupons: [coupon({ status: "expired", id: "coupon-2", code: "VELHO" })] }),
    );

    expect(result.rejectedCoupons).toEqual([
      { couponId: "coupon-2", code: "VELHO", reason: "inactive" },
    ]);
  });
});

describe("createOrder: events", () => {
  test("financial then fulfilment, in that order", () => {
    const result = createOrder(input({ paymentMethod: "pix" }));

    expect(result.events).toEqual([
      { type: "financial_changed", fromValue: null, toValue: "awaiting_payment" },
      { type: "fulfilment_changed", fromValue: null, toValue: "pending" },
    ]);
  });

  test("wallet applied emits wallet_reserved last", () => {
    const result = createOrder(input({ walletAvailableCents: 5000, walletRequestedCents: 800 }));

    expect(result.walletAppliedCents).toBe(800);
    expect(result.events.map((event) => event.type)).toEqual([
      "financial_changed",
      "fulfilment_changed",
      "wallet_reserved",
    ]);
  });

  test("no wallet applied emits no wallet_reserved", () => {
    const result = createOrder(input({ walletAvailableCents: 5000, walletRequestedCents: 0 }));

    expect(result.walletAppliedCents).toBe(0);
    expect(result.events.map((event) => event.type)).toEqual([
      "financial_changed",
      "fulfilment_changed",
    ]);
  });
});

describe("createOrder: determinism", () => {
  test("same input, same result — including the expiry", () => {
    const args = input({ paymentMethod: "credit" });

    expect(createOrder(args)).toEqual(createOrder(args));
  });

  test("the input clock is never mutated", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const result = createOrder(input({ paymentMethod: "pix", now }));

    expect(now.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(result.expiresAt?.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });
});
