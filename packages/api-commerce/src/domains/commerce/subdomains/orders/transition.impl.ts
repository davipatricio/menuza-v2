/**
 * Commerce / orders / transition implementation (MEN-93).
 *
 * `applyTransition` decides; this handler only loads the current row, persists
 * the new axis value and appends the event. The engine's three refusals map to
 * the contract's own error codes so the dashboard can tell a stale button
 * (`ORDER_TRANSITION_INVALID`) from a missing reason (`REASON_REQUIRED`).
 */
import { randomUUID } from "node:crypto";
import { ORPCError, implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import {
  applyTransition,
  commerceContractObject,
  releasesCoupon,
  releasesStock,
} from "@menuza/shared/commerce";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db, releaseCouponRedemptions, releaseVariationStock, stockLinesFor } from "@menuza/db";
import { actorOf, notFound, requireCapability, requireMember } from "../../support.ts";

const os = implement(
  commerceContractObject.orders.transition,
).$context<RequestHeadersHandlerPluginContext>();

export const transitionOrderImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const member = await requireMember(context.reqHeaders, tenantId);

    requireCapability(member.role, "orders:write");

    const order = await db.orm.public.Order.where({ tenantId, code: input.code }).first();

    if (!order) throw notFound();

    const from = input.axis === "financial" ? order.financialStatus : order.fulfilmentStatus;

    const applied = applyTransition(
      { axis: input.axis, from, to: input.to, reason: input.reason ?? null },
      actorOf(member),
    );

    if (!applied.ok) {
      if (applied.reason === "forbidden") {
        throw new ORPCError("FORBIDDEN", {
          message: sharedErrorCodes.FORBIDDEN.message,
          data: { code: "FORBIDDEN" },
        });
      }

      if (applied.reason === "reason_required") {
        throw new ORPCError("REASON_REQUIRED", { message: "Esta transição exige um motivo." });
      }

      throw new ORPCError("ORDER_TRANSITION_INVALID", {
        message: "Transição de pedido não permitida.",
        data: { reason: `${from} -> ${input.to}` },
      });
    }

    const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

    // SAFETY: the engine approved this tuple on this axis, and every `to` in the
    // table is one of the column's own slugs, so the cast is the table's promise.
    const next = input.to as typeof order.financialStatus & typeof order.fulfilmentStatus;

    await db.transaction(async (tx) => {
      // `updateAll`, not `update`: the planner compiles `update` from
      // `where({ tenantId, id })` down to `id` only, and the isolation guard
      // then rejects the write.
      await tx.orm.public.Order.where({ tenantId, id: order.id }).updateAll(
        input.axis === "financial"
          ? { financialStatus: next, updatedAt: now }
          : { fulfilmentStatus: next, updatedAt: now },
      );

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId,
        orderId: order.id,
        type: input.axis === "financial" ? "financial_changed" : "fulfilment_changed",
        fromValue: from,
        toValue: input.to,
        actorMemberId: member.memberId,
        reason: input.reason ?? null,
        createdAt: now,
      });

      // The stock goes back on the edge into a state the order never leaves:
      // a cancelled order never reaches the buyer. Comparing the pair before
      // and after is what makes the release happen once, even when the order
      // is later expired as well. The coupon follows the same edge, but only
      // while the order is unpaid — see `releasesCoupon`.
      const nowPair = {
        fulfilment: input.axis === "fulfilment" ? next : order.fulfilmentStatus,
        financial: input.axis === "financial" ? next : order.financialStatus,
      };

      const before = { fulfilment: order.fulfilmentStatus, financial: order.financialStatus };

      if (!releasesStock(before.fulfilment, before.financial)) {
        if (releasesStock(nowPair.fulfilment, nowPair.financial)) {
          const items = await tx.orm.public.OrderItem.where({ tenantId, orderId: order.id }).all();

          await releaseVariationStock(tx, tenantId, await stockLinesFor(tx, tenantId, items));
        }
      }

      if (
        !releasesCoupon(before.fulfilment, before.financial) &&
        releasesCoupon(nowPair.fulfilment, nowPair.financial)
      ) {
        await releaseCouponRedemptions(tx, tenantId, order.id);
      }
    });

    return {
      financialStatus: input.axis === "financial" ? next : order.financialStatus,
      fulfilmentStatus: input.axis === "fulfilment" ? next : order.fulfilmentStatus,
    };
  });

export type TransitionOrderImpl = typeof transitionOrderImpl;
