/**
 * What the coupons list needs that `Coupon` alone cannot answer: how many times
 * each coupon was redeemed, what it cost the store, and how many customers
 * used it.
 *
 * `Coupon.usageCount` is a counter of its own and drifts when a redemption is
 * written outside `applyCoupons`; the redemptions are the ledger, so every
 * number here is counted from `CouponRedemption`. `usageCount` still travels
 * because the limit display reads it.
 */
import { db } from "@menuza/db";
import type { CouponStatus } from "@menuza/shared/tenant";

import { toOptionalPanelTimestamp, toPanelTimestamp } from "./format.ts";
import { inTenantScope } from "./support.ts";

/** The slice of a `Coupon` row these summaries read. */
export interface CouponRow {
  readonly id: string;
  readonly code: string;
  readonly description: string | null;
  readonly discountType: "percentage" | "fixed";
  readonly value: number;
  readonly usageCount: number;
  readonly usageLimit: number | null;
  readonly perCustomerLimit: number | null;
  readonly minimumOrderCents: number | null;
  readonly maximumDiscountCents: number | null;
  readonly shippingDiscountPercent: number | null;
  readonly startsAt: Temporal.PlainDateTime | null;
  readonly endsAt: Temporal.PlainDateTime | null;
  readonly stackable: boolean;
  readonly firstPurchaseOnly: boolean;
  readonly status: CouponStatus;
}

export interface RedemptionAggregate {
  readonly couponId: string;
  readonly redemptions: number;
  readonly discountCents: number;
  readonly customers: number;
  readonly lastRedeemedAt: string | null;
  readonly firstRedeemedAt: string | null;
}

/**
 * A coupon past its `endsAt` reads as expired whatever the stored status says:
 * nothing writes `expired`, so the column cannot be trusted for display.
 */
export function effectiveCouponStatus(coupon: CouponRow, now: Date): CouponStatus {
  if (coupon.status !== "active") return coupon.status;

  const endsAt = coupon.endsAt;

  if (endsAt === null) return "active";

  // Both sides are UTC-naive wall clock, so the comparison never involves a
  // timezone: `endsAt` holds the end of the day the member picked.
  return Temporal.PlainDateTime.compare(endsAt, toPlainUtc(now)) < 0 ? "expired" : "active";
}

/** `order` rows and `now` are instants; the window columns are UTC wall clock. */
function toPlainUtc(instant: Date): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO("UTC")
    .toPlainDateTime();
}

/** `value` is cents for a fixed discount and a whole percent for a percentage one. */
export function couponValues(coupon: CouponRow) {
  return {
    valueCents: coupon.discountType === "fixed" ? coupon.value : null,
    valuePercent: coupon.discountType === "percentage" ? coupon.value : null,
  };
}

function emptyAggregate(couponId: string): RedemptionAggregate {
  return {
    couponId,
    redemptions: 0,
    discountCents: 0,
    customers: 0,
    lastRedeemedAt: null,
    firstRedeemedAt: null,
  };
}

/**
 * One grouped read over the store's redemptions, folded into a map so the list
 * does not issue a query per coupon.
 *
 * Grouping by `(couponId, customerId)` is what lets the database do the
 * counting: each row is one customer's use of one coupon, already summed and
 * timestamped by SQL. Folding those rows into per-coupon totals is O(distinct
 * pairs) in JS — bounded by customers, not by redemptions — so a tenant with
 * 100k redemptions and 2k customers folds 2k rows, not 100k. Grouping by
 * `couponId` alone cannot yield the distinct-customer count: the aggregate
 * alphabet is `count/sum/avg/min/max` only.
 */
export async function redemptionAggregates(
  tenantId: string,
  couponIds: readonly string[],
): Promise<Map<string, RedemptionAggregate>> {
  const aggregates = new Map<string, RedemptionAggregate>();

  if (couponIds.length === 0) return aggregates;

  const rows = await inTenantScope(tenantId, () =>
    db.orm.public.CouponRedemption.where({ tenantId })
      .where((redemption) => redemption.couponId.in([...couponIds]))
      .groupBy("couponId", "customerId")
      .aggregate((aggregate) => ({
        redemptions: aggregate.count(),
        discountCents: aggregate.sum("discountCents"),
        lastRedeemedAt: aggregate.max("createdAt"),
        firstRedeemedAt: aggregate.min("createdAt"),
      })),
  );

  for (const row of rows) {
    const current = aggregates.get(row.couponId) ?? emptyAggregate(row.couponId);
    // Same formatter as the detail page, so one redemption renders the same
    // instant in both. A bare `PlainDateTime` string would carry no offset and
    // the client would parse it as local time, three hours off in BRT.
    const last = toOptionalPanelTimestamp(row.lastRedeemedAt);
    const first = toOptionalPanelTimestamp(row.firstRedeemedAt);

    aggregates.set(row.couponId, {
      couponId: row.couponId,
      redemptions: current.redemptions + row.redemptions,
      discountCents: current.discountCents + (row.discountCents ?? 0),
      customers: current.customers + 1,
      lastRedeemedAt:
        last === null || (current.lastRedeemedAt !== null && last <= current.lastRedeemedAt)
          ? current.lastRedeemedAt
          : last,
      firstRedeemedAt:
        first === null || (current.firstRedeemedAt !== null && first >= current.firstRedeemedAt)
          ? current.firstRedeemedAt
          : first,
    });
  }

  return aggregates;
}

/** The coupon row as the summary schema carries it. */
export function toCouponSummary(
  coupon: CouponRow,
  aggregate: RedemptionAggregate | undefined,
  now: Date,
) {
  const totals = aggregate ?? emptyAggregate(coupon.id);

  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description ?? null,
    discountType: coupon.discountType,
    ...couponValues(coupon),
    shippingDiscountPercent: coupon.shippingDiscountPercent ?? null,
    status: coupon.status,
    usageCount: coupon.usageCount,
    usageLimit: coupon.usageLimit ?? null,
    perCustomerLimit: coupon.perCustomerLimit ?? null,
    minimumOrderCents: coupon.minimumOrderCents ?? null,
    maximumDiscountCents: coupon.maximumDiscountCents ?? null,
    startsAt: toOptionalPanelTimestamp(coupon.startsAt),
    endsAt: toOptionalPanelTimestamp(coupon.endsAt),
    stackable: Boolean(coupon.stackable),
    firstPurchaseOnly: Boolean(coupon.firstPurchaseOnly),
    effectiveStatus: effectiveCouponStatus(coupon, now),
    redemptionCount: totals.redemptions,
    discountCents: totals.discountCents,
    uniqueCustomers: totals.customers,
    lastRedeemedAt: totals.lastRedeemedAt,
  };
}

/**
 * The usage series, one bucket per UTC day that had a redemption. Empty days
 * are omitted rather than zero-filled: the chart marks the range from the first
 * and last bucket it receives, and a gap is visible as a gap.
 */
export function usageSeries(
  rows: readonly {
    readonly createdAt: unknown;
    readonly redemptions: number;
    readonly discountCents: number | null;
  }[],
): { bucket: string; redemptions: number; discountCents: number }[] {
  const buckets = new Map<string, { redemptions: number; discountCents: number }>();

  for (const row of rows) {
    const bucket = String(row.createdAt).slice(0, 10);
    const current = buckets.get(bucket) ?? { redemptions: 0, discountCents: 0 };

    buckets.set(bucket, {
      redemptions: current.redemptions + row.redemptions,
      discountCents: current.discountCents + (row.discountCents ?? 0),
    });
  }

  return [...buckets.entries()]
    .map(([bucket, totals]) => ({ bucket, ...totals }))
    .sort((left, right) => left.bucket.localeCompare(right.bucket));
}
