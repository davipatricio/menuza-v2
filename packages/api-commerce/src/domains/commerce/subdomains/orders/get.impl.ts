/**
 * Commerce / orders / get implementation (MEN-93).
 *
 * The dashboard's order page: the money, both status axes, the lines and the
 * append-only event trail, plus the transitions the **caller** may perform —
 * `nextTransitions` filtered through `can`, so a `staff` member never sees a
 * refund they would be refused.
 */
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject, nextTransitions } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import {
  actorOf,
  isoOf,
  notFound,
  optionalIso,
  requireCapability,
  requireMember,
} from "../../support.ts";

const os = implement(
  commerceContractObject.orders.get,
).$context<RequestHeadersHandlerPluginContext>();

export const getOrderImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const member = await requireMember(context.reqHeaders, tenantId);

    requireCapability(member.role, "orders:read");

    const order = await db.orm.public.Order.where({ tenantId, code: input.code }).first();

    if (!order) throw notFound();

    const [items, events, coupon] = await Promise.all([
      db.orm.public.OrderItem.where({ tenantId, orderId: order.id })
        .orderBy((item) => item.name.asc())
        .all(),
      db.orm.public.OrderEvent.where({ tenantId, orderId: order.id })
        .orderBy((event) => event.createdAt.asc())
        .all(),
      order.couponId === null
        ? null
        : db.orm.public.Coupon.where({ tenantId, id: order.couponId }).first(),
    ]);

    const actor = actorOf(member);

    const allowed = [
      ...nextTransitions("financial", order.financialStatus, actor),
      ...nextTransitions("fulfilment", order.fulfilmentStatus, actor),
    ];

    return {
      id: order.id,
      code: order.code,
      customerId: order.customerId,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      shippingCents: order.shippingCents,
      walletAppliedCents: order.walletAppliedCents,
      cashbackCents: order.cashbackCents,
      totalCents: order.totalCents,
      financialStatus: order.financialStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      paymentMethod: order.paymentMethod,
      paidAt: optionalIso(order.paidAt),
      expiresAt: optionalIso(order.expiresAt),
      couponCode: coupon?.code ?? null,
      rejectedCoupons: [],
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
        optionsLabel: item.optionsLabel ?? null,
      })),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        fromValue: event.fromValue ?? null,
        toValue: event.toValue ?? null,
        reason: event.reason ?? null,
        createdAt: isoOf(event.createdAt),
      })),
      allowedNextTransitions: allowed.map((rule) => ({
        axis: rule.axis,
        to: rule.to,
        capability: rule.capability,
        requiresReason: rule.requiresReason,
      })),
    };
  });

export type GetOrderImpl = typeof getOrderImpl;
