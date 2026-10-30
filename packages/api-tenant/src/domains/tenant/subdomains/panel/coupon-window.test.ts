import { describe, expect, test } from "bun:test";

import { couponWindow, endOfCouponWindow, startOfCouponWindow } from "./coupon-window.ts";

describe("couponWindow: day granularity", () => {
  test("a bare date starts at the first instant and ends at the last", () => {
    expect(String(startOfCouponWindow("2026-10-01"))).toBe("2026-10-01T00:00:00");
    expect(String(endOfCouponWindow("2026-10-31"))).toBe("2026-10-31T23:59:59.999");
  });

  test("an input that already carries a time keeps it", () => {
    expect(String(startOfCouponWindow("2026-10-01T08:30:00"))).toBe("2026-10-01T08:30:00");
    expect(String(endOfCouponWindow("2026-10-31T18:00:00"))).toBe("2026-10-31T18:00:00");
  });

  test("an empty value means no bound", () => {
    expect(couponWindow(null, "")).toEqual({ startsAt: null, endsAt: null });
  });
});

describe("couponWindow: ordering", () => {
  test("a window that opens after it closes is refused, not corrected", () => {
    expect(() => couponWindow("2026-11-01", "2026-10-31")).toThrow(
      "A data de início não pode ser posterior à data de término.",
    );
  });

  test("a single-day window is accepted", () => {
    const { startsAt, endsAt } = couponWindow("2026-10-31", "2026-10-31");

    expect(String(startsAt)).toBe("2026-10-31T00:00:00");
    expect(String(endsAt)).toBe("2026-10-31T23:59:59.999");
  });
});
