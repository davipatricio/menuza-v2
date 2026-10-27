import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { conflict, notFound } from "../session/support.ts";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.updateCoupon,
).$context<RequestHeadersHandlerPluginContext>();

function parseTimestamp(value: string | null | undefined) {
  if (value == null || value === "") return null;

  return Temporal.PlainDateTime.from(value);
}

function toCoupon(row: any) {
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? null,
    discountType: row.discountType,
    valueCents: row.discountType === "fixed" ? row.value : null,
    valuePercent: row.discountType === "percentage" ? row.value : null,
    usageCount: row.usageCount,
    usageLimit: row.usageLimit ?? null,
    perCustomerLimit: row.perCustomerLimit ?? null,
    minimumOrderCents: row.minimumOrderCents ?? null,
    maximumDiscountCents: row.maximumDiscountCents ?? null,
    shippingDiscountPercent: row.shippingDiscountPercent ?? null,
    startsAt: row.startsAt == null ? null : String(row.startsAt),
    endsAt: row.endsAt == null ? null : String(row.endsAt),
    stackable: Boolean(row.stackable),
    firstPurchaseOnly: Boolean(row.firstPurchaseOnly),
    status: row.status,
  };
}

export const updateCouponImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);
  const code = input.code.trim().toUpperCase();

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).first(),
  );

  if (!existing) throw notFound();

  if (code !== existing.code) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Coupon.where({ tenantId: store.tenantId, code }).first(),
    );

    if (duplicate) throw conflict();
  }

  let startsAt = parseTimestamp(input.startsAt);
  let endsAt = parseTimestamp(input.endsAt);

  if (startsAt != null && endsAt != null && Temporal.PlainDateTime.compare(startsAt, endsAt) > 0)
    startsAt = endsAt;

  let rows;

  try {
    // `updateAll`, not `update`: the planner compiles `update` from
    // `where({ tenantId, id })` down to `id` only, and the isolation guard
    // then rejects the write.
    rows = await inTenantScope(store.tenantId, () =>
      db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).updateAll({
        code,
        description: input.description ?? null,
        discountType: input.discountType,
        value: input.discountValue,
        status: input.status,
        startsAt,
        endsAt,
        usageLimit: input.usageLimit ?? null,
        perCustomerLimit: input.perCustomerLimit ?? null,
        minimumOrderCents: input.minimumOrderCents ?? null,
        maximumDiscountCents: input.maximumDiscountCents ?? null,
        shippingDiscountPercent: input.shippingDiscountPercent ?? null,
        stackable: input.stackable,
        firstPurchaseOnly: input.firstPurchaseOnly,
      }),
    );
  } catch (error) {
    if (error instanceof Error && /Coupon_tenantId_code_key|duplicate key/i.test(error.message))
      throw conflict();
    throw error;
  }

  const row = rows[0];

  if (!row) throw notFound();

  return { coupon: toCoupon(row) };
});

export type UpdateCouponImpl = typeof updateCouponImpl;
