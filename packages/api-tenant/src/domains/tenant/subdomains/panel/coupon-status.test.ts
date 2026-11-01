import { describe, expect, test } from "bun:test";

import { resolveCouponStatus } from "./coupon-status.ts";

describe("resolveCouponStatus: the end of the day decides", () => {
  test("a window still open keeps the requested status", () => {
    expect(
      resolveCouponStatus({
        requested: "active",
        endsAt: "2026-10-31",
        now: new Date("2026-10-31T18:00:00Z"),
      }),
    ).toBe("active");

    expect(
      resolveCouponStatus({
        requested: "disabled",
        endsAt: "2026-10-31",
        now: new Date("2026-10-31T18:00:00Z"),
      }),
    ).toBe("disabled");
  });

  test("a window that has closed is expired, whatever was requested", () => {
    expect(
      resolveCouponStatus({
        requested: "active",
        endsAt: "2026-10-31",
        now: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe("expired");

    expect(
      resolveCouponStatus({
        requested: "disabled",
        endsAt: "2026-10-31",
        now: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe("expired");
  });

  test("no end date means no expiry", () => {
    expect(
      resolveCouponStatus({
        requested: "active",
        endsAt: null,
        now: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe("active");

    expect(
      resolveCouponStatus({
        requested: "active",
        endsAt: "",
        now: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe("active");
  });
});
