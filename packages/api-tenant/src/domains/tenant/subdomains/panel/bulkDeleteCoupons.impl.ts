import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { deleteCouponRow, type CouponDeleteOutcome } from "./coupon-delete.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.bulkDeleteCoupons,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * One transaction over the whole selection: the rule that archives a coupon an
 * order or a redemption still names and hard-deletes the rest is
 * `deleteCouponRow`'s, shared with `deleteCoupon`, so the two paths cannot drift.
 *
 * An id the store does not own — unknown, another tenant's, or already archived
 * — is `NOT_FOUND`, and the batch rolls back rather than reporting a partial
 * delete over a selection the caller cannot see. Tenancy is checked per row by
 * the helper's `where.tenantId`, so a foreign id never leaks its existence.
 */
export const bulkDeleteCouponsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const outcomes = await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      const results: CouponDeleteOutcome[] = [];

      for (const couponId of input.couponIds) {
        results.push(await deleteCouponRow(tx, store.tenantId, couponId));
      }

      return results;
    }),
  );

  return {
    deleted: outcomes.filter((outcome) => outcome === "deleted").length,
    archived: outcomes.filter((outcome) => outcome === "archived").length,
  };
});

export type BulkDeleteCouponsImpl = typeof bulkDeleteCouponsImpl;
