/**
 * Where the stored coupon status meets the validity window.
 *
 * `expired` is derived, never chosen: the panel's switch sends only `active` or
 * `disabled`, and a coupon whose window has closed is expired whatever the
 * column says. Writing the derived value on every save keeps the rows that were
 * saved honest, and a legacy row already stored as `expired` is reset by its
 * next save. The read path keeps `effectiveCouponStatus()` because an untouched
 * row is never rewritten.
 */
import type { CouponStatus } from "@menuza/shared/tenant";

import { couponWindow } from "./coupon-window.ts";

/** The two states the write path accepts. */
export type CouponWriteStatus = "active" | "disabled";

/**
 * `endsAt` is widened to the end of the day the member picked, exactly as the
 * row is saved, so the status and the stored window never disagree about the
 * last day.
 */
export function resolveCouponStatus({
  requested,
  endsAt,
  now,
}: {
  readonly requested: CouponWriteStatus;
  readonly endsAt: string | null | undefined;
  readonly now: Date;
}): CouponStatus {
  const end = couponWindow(undefined, endsAt).endsAt;

  if (end === null) return requested;

  // Both sides are UTC-naive wall clock, so the comparison never involves a
  // timezone: `endsAt` holds the end of the day the member picked.
  return Temporal.PlainDateTime.compare(end, toPlainUtc(now)) < 0 ? "expired" : requested;
}

/** `now` is an instant; the window columns are UTC wall clock. */
function toPlainUtc(instant: Date): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO("UTC")
    .toPlainDateTime();
}
