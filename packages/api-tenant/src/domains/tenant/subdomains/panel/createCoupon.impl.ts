import { randomUUID } from "node:crypto";
// Temporal is provided by the runtime.
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { conflict, notFound, requireSession } from "../session/support.ts";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(tenantContractObject.panel.createCoupon).$context<RequestHeadersHandlerPluginContext>();

function toPlainDateTime(value: string | null | undefined) {
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
    startsAt: row.startsAt == null ? null : String(row.startsAt),
    endsAt: row.endsAt == null ? null : String(row.endsAt),
    stackable: Boolean(row.stackable),
    firstPurchaseOnly: Boolean(row.firstPurchaseOnly),
    status: row.status,
  };
}

export const createCouponImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  let parsedStarts = toPlainDateTime(input.startsAt ?? null);
  let parsedEnds = toPlainDateTime(input.endsAt ?? null);
  if (parsedStarts != null && parsedEnds != null && Temporal.PlainDateTime.compare(parsedStarts, parsedEnds) > 0) {
    parsedStarts = parsedEnds;
  }

  const code = input.code.trim().toUpperCase();
  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, code }).first(),
  );
  if (existing) throw conflict();

  let row;
  try {
    row = await inTenantScope(store.tenantId, () =>
      db.orm.public.Coupon.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        code,
        description: input.description ?? null,
        discountType: input.discountType,
        value: input.discountValue,
        status: input.status,
        startsAt: parsedStarts,
        endsAt: parsedEnds,
        usageLimit: input.usageLimit ?? null,
        perCustomerLimit: input.perCustomerLimit ?? null,
        minimumOrderCents: input.minimumOrderCents ?? null,
        maximumDiscountCents: input.maximumDiscountCents ?? null,
        stackable: input.stackable,
        firstPurchaseOnly: input.firstPurchaseOnly,
      }),
    );
  } catch (error) {
    if (error instanceof Error && /Coupon_tenantId_code_key|duplicate key/i.test(error.message)) throw conflict();
    throw error;
  }

  return { coupon: toCoupon(row) };
});

export type CreateCouponImpl = typeof createCouponImpl;
