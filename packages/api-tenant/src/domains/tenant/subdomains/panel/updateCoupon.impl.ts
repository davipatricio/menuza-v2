import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { and, db } from "@menuza/db";
import { conflict, notFound } from "../session/support.ts";
import { couponWindow } from "./coupon-window.ts";
import { resolveCouponStatus } from "./coupon-status.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.updateCoupon,
).$context<RequestHeadersHandlerPluginContext>();

function toCoupon(row: any, productIds: readonly string[]) {
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
    productScopeMode:
      row.productScopeMode === "exclude" ? ("exclude" as const) : ("include" as const),
    productIds: [...productIds],
  };
}

export const updateCouponImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const code = input.code.trim().toUpperCase();

  // A soft-deleted coupon is history: it is not found, so it cannot be edited
  // back into a live row.
  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where((coupon) =>
      and(
        coupon.tenantId.eq(store.tenantId),
        coupon.id.eq(input.couponId),
        coupon.deletedAt.eq(null),
      ),
    ).first(),
  );

  if (!existing) throw notFound();

  if (code !== existing.code) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Coupon.where({ tenantId: store.tenantId, code }).first(),
    );

    if (duplicate) throw conflict();
  }

  const { startsAt, endsAt } = couponWindow(input.startsAt, input.endsAt);

  // `expired` is derived from the window on every save, never taken from input.
  const status = resolveCouponStatus({
    requested: input.status,
    endsAt: input.endsAt,
    now: new Date(),
  });

  let rows;

  try {
    rows = await inTenantScope(store.tenantId, () =>
      db.transaction(async (tx) => {
        // A foreign id is `NOT_FOUND` rather than a row the join trigger would
        // reject later, and one read covers the whole set.
        if (input.productIds.length > 0) {
          const owned = await tx.orm.public.Product.where({ tenantId: store.tenantId })
            .where((product) => product.id.in(input.productIds))
            .select("id")
            .all();

          if (owned.length !== input.productIds.length) throw notFound();
        }

        // `updateAll`, not `update`: the planner compiles `update` from
        // `where({ tenantId, id })` down to `id` only, and the isolation guard
        // then rejects the write.
        const updated = await tx.orm.public.Coupon.where({
          tenantId: store.tenantId,
          id: input.couponId,
        }).updateAll({
          code,
          description: input.description ?? null,
          discountType: input.discountType,
          value: input.discountValue,
          status,
          productScopeMode: input.productScopeMode,
          startsAt,
          endsAt,
          usageLimit: input.usageLimit ?? null,
          perCustomerLimit: input.perCustomerLimit ?? null,
          minimumOrderCents: input.minimumOrderCents ?? null,
          maximumDiscountCents: input.maximumDiscountCents ?? null,
          shippingDiscountPercent: input.shippingDiscountPercent ?? null,
          stackable: input.stackable,
          firstPurchaseOnly: input.firstPurchaseOnly,
        });

        // Whole-row update: the scope is the set that was sent, so the links are
        // swapped rather than merged. Both writes share the transaction, so no
        // reader ever sees the coupon without its products.
        await tx.orm.public.CouponProduct.where({
          tenantId: store.tenantId,
          couponId: input.couponId,
        }).deleteAll();

        if (input.productIds.length > 0) {
          await tx.orm.public.CouponProduct.createAll(
            input.productIds.map((productId) => ({
              tenantId: store.tenantId,
              couponId: input.couponId,
              productId,
            })),
          );
        }

        return updated;
      }),
    );
  } catch (error) {
    if (error instanceof Error && /Coupon_tenantId_code_key|duplicate key/i.test(error.message))
      throw conflict();
    throw error;
  }

  const row = rows[0];

  if (!row) throw notFound();

  return { coupon: toCoupon(row, input.productIds) };
});

export type UpdateCouponImpl = typeof updateCouponImpl;
