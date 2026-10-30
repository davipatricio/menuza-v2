/**
 * URL state for the coupons list and the coupon detail history. The Server
 * Component filters and sorts, and the client toolbars write the same keys back
 * — exactly the shape `catalog/products/product-search-params.ts` uses.
 */
import {
  createLoader,
  type inferParserType,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

const LIST_SORTS = ["code", "redemptions", "discount", "lastRedeemed", "endDate"] as const;

export const couponSearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["all", "active", "expired", "disabled"] as const).withDefault(
    "all",
  ),
  sort: parseAsStringLiteral(LIST_SORTS).withDefault("code"),
  order: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
};

export const loadCouponSearchParams = createLoader(couponSearchParams);

export type CouponSearchParams = inferParserType<typeof couponSearchParams>;

/**
 * The detail screen's history: the same `q` (customer name, e-mail or order
 * code) and its own sort, because ordering redemptions by coupon code would be
 * meaningless.
 */
export const couponRedemptionSearchParams = {
  q: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(["recent", "oldest", "discount"] as const).withDefault("recent"),
  // 1-based page of the server-side history read.
  page: parseAsInteger.withDefault(1),
};

export const loadCouponRedemptionSearchParams = createLoader(couponRedemptionSearchParams);

/** Read by the page for the request and by the table for its own paginator. */
export const REDEMPTION_PAGE_SIZE = 20;

export type CouponRedemptionSearchParams = inferParserType<typeof couponRedemptionSearchParams>;
