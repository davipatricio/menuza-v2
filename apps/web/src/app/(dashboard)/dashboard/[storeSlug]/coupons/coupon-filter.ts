/**
 * Pure filtering and ordering for the coupons list. Runs on the server over the
 * one `panel.listCouponSummaries` payload: the read is session-scoped, so there
 * is no cross-request cache to share, and the same query must always render the
 * same rows.
 *
 * The status filter reads `effectiveStatus`, not `status` — a coupon whose
 * `endsAt` passed is expired on screen even though nothing wrote `expired`.
 */
import type { PanelCouponSummary } from "@menuza/shared/tenant";

import type { CouponSearchParams } from "./coupon-search-params.ts";

/** Everything a search box should match: identity and description. */
export function couponHaystack(coupon: PanelCouponSummary): string {
  return [coupon.code, coupon.description ?? ""].join(" ").toLowerCase();
}

export function filterCoupons(
  coupons: readonly PanelCouponSummary[],
  filters: CouponSearchParams,
): PanelCouponSummary[] {
  const query = filters.q.trim().toLowerCase();

  return coupons
    .filter((coupon) => {
      if (filters.status !== "all" && coupon.effectiveStatus !== filters.status) return false;

      if (query === "") return true;

      return couponHaystack(coupon).includes(query);
    })
    .sort((left, right) => compareCoupons(left, right, filters));
}

/** Nulls sort last in both directions: "no last use" is not a date. */
function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: 1 | -1,
): number {
  if (left === null && right === null) return 0;

  if (left === null) return 1;

  if (right === null) return -1;

  return (left - right) * direction;
}

function compareCoupons(
  left: PanelCouponSummary,
  right: PanelCouponSummary,
  filters: CouponSearchParams,
): number {
  const direction = filters.order === "asc" ? 1 : -1;
  const byCode = left.code.localeCompare(right.code, "pt-BR");

  switch (filters.sort) {
    case "redemptions":
      return (left.redemptionCount - right.redemptionCount) * direction || byCode;

    case "discount":
      return (left.discountCents - right.discountCents) * direction || byCode;

    case "lastRedeemed": {
      const leftAt = left.lastRedeemedAt === null ? null : Date.parse(left.lastRedeemedAt);
      const rightAt = right.lastRedeemedAt === null ? null : Date.parse(right.lastRedeemedAt);

      return compareNullableNumber(leftAt, rightAt, direction) || byCode;
    }

    case "endDate": {
      const leftAt = left.endsAt === null ? null : Date.parse(left.endsAt);
      const rightAt = right.endsAt === null ? null : Date.parse(right.endsAt);

      return compareNullableNumber(leftAt, rightAt, direction) || byCode;
    }

    default:
      return byCode * direction;
  }
}
