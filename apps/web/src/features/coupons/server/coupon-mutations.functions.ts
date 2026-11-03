/**
 * Server functions for the coupon writes behind the list and the form.
 *
 * A write answers with a discriminated result instead of throwing: the islands
 * branch on `code` and keep the copy here, where a thrown `ApiError` would only
 * surface as a generic failure. Read the addressing from `@menuza/shared/tenant`
 * so the form and the API agree on one schema.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import {
  CreateCouponInputSchema,
  UpdateCouponInputSchema,
  type PanelCoupon,
} from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import { panelClient } from "@/server/panel-client.ts";

/** The failure half of every write result, shared by the islands' copy maps. */
export type CouponMutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

export type CouponMutationResult = { status: "ok"; data: PanelCoupon } | CouponMutationFailure;

/** `null` on success: the switch only needs to know the status was stored. */
export type CouponStatusResult = { status: "ok"; data: null } | CouponMutationFailure;

export type CouponBulkDeleteResult =
  | { status: "ok"; data: { deleted: number; archived: number } }
  | CouponMutationFailure;

/**
 * `setCouponStatus` and `bulkDeleteCoupons` take no exported input schema, so
 * the transport fields are declared here; the API still validates the payload.
 */
const setCouponStatusSchema = v.object({
  storeSlug: v.string(),
  couponId: v.string(),
  status: v.picklist(["active", "disabled"]),
});

const bulkDeleteCouponsSchema = v.object({
  storeSlug: v.string(),
  couponIds: v.array(v.string()),
});

function failure(error: Error): CouponMutationFailure {
  if (error instanceof ApiError) {
    return { status: "error", code: error.code, message: error.message };
  }

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const createCouponFn = createServerFn({ method: "POST" })
  .validator(CreateCouponInputSchema)
  .handler(async ({ data }): Promise<CouponMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { coupon } = await client.panel.createCoupon(data);

      return { status: "ok", data: coupon };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateCouponFn = createServerFn({ method: "POST" })
  .validator(UpdateCouponInputSchema)
  .handler(async ({ data }): Promise<CouponMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { coupon } = await client.panel.updateCoupon(data);

      return { status: "ok", data: coupon };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const setCouponStatusFn = createServerFn({ method: "POST" })
  .validator(setCouponStatusSchema)
  .handler(async ({ data }): Promise<CouponStatusResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.setCouponStatus(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const bulkDeleteCouponsFn = createServerFn({ method: "POST" })
  .validator(bulkDeleteCouponsSchema)
  .handler(async ({ data }): Promise<CouponBulkDeleteResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { deleted, archived } = await client.panel.bulkDeleteCoupons(data);

      return { status: "ok", data: { deleted, archived } };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });
