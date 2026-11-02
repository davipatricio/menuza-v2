/**
 * Server function behind the coupon detail route: the coupon, one page of its
 * redemptions, the usage series and the scope picker options.
 *
 * The scope picker is a best-effort read: a failing catalog call leaves the
 * picker with the coupon's own products instead of failing the page.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { PanelCouponSummary } from "@menuza/shared/tenant";
import { panelClient, type TenantClient } from "@/server/panel-client.ts";
import { REDEMPTION_PAGE_SIZE } from "@/features/coupons/schemas/coupon-search.ts";

export type CouponProductOption = { id: string; name: string };

export type CouponDetailResult =
  | {
      status: "ok";
      coupon: PanelCouponSummary;
      redemptions: Awaited<ReturnType<TenantClient["panel"]["getCouponDetail"]>>["redemptions"];
      redemptionsTotal: number;
      usage: Awaited<ReturnType<TenantClient["panel"]["getCouponDetail"]>>["usage"];
      ordersWithCouponCents: number;
      scopedProducts: CouponProductOption[];
      products: CouponProductOption[];
    }
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const loadCouponDetailFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      couponId: v.string(),
      q: v.optional(v.string(), ""),
      sort: v.optional(v.picklist(["recent", "oldest", "discount"]), "recent"),
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    }),
  )
  .handler(async ({ data }): Promise<CouponDetailResult> => {
    const client = await panelClient();

    // No panel session: the layout already resolved the store, so signing in
    // again is the recovery, not a 404.
    if (!client) return { status: "unauthenticated" };

    const [detail, products] = await Promise.all([
      (async () => {
        try {
          return await client.panel.getCouponDetail({
            storeSlug: data.storeSlug,
            couponId: data.couponId,
            search: data.q.trim() === "" ? undefined : data.q.trim(),
            sort: data.sort,
            page: data.page,
            pageSize: REDEMPTION_PAGE_SIZE,
          });
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const { products: rows } = await client.panel.listProducts({
            storeSlug: data.storeSlug,
          });

          return rows.map((row) => ({ id: row.id, name: row.name }));
        } catch {
          // SAFETY: an empty array satisfies the option-list element type.
          return [] as CouponProductOption[];
        }
      })(),
    ]);

    if (!detail) return { status: "not-found" };

    // Selected products lead the picker, using the names the detail read gave us.
    const seen = new Set((detail.products ?? []).map((product) => product.id));

    return {
      status: "ok",
      coupon: detail.coupon,
      redemptions: detail.redemptions,
      redemptionsTotal: detail.redemptionsTotal,
      usage: detail.usage,
      ordersWithCouponCents: detail.ordersWithCouponCents,
      scopedProducts: detail.products ?? [],
      products: [
        ...(detail.products ?? []),
        ...products.filter((product) => !seen.has(product.id)),
      ],
    };
  });
