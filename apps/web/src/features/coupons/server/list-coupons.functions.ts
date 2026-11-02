/**
 * Server function for the coupons screen.
 *
 * One `listCouponSummaries` read; the route loader filters and sorts it with the
 * ported pure helper. No cache: the read is session-scoped and the table's own
 * mutations invalidate it.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { panelClient } from "@/server/panel-client.ts";

export const listCouponSummariesFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listCouponSummaries({ storeSlug: data.storeSlug });
  });

export type PanelCouponsPayload = NonNullable<Awaited<ReturnType<typeof listCouponSummariesFn>>>;

export type CouponRow = PanelCouponsPayload["coupons"][number];
