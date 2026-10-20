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
import { applyTransition, commerceContractObject } from "@menuza/shared/commerce";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
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
      await tx.orm.public.Order.where({ tenantId, id: order.id }).update(
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
    });

    return {
      financialStatus: input.axis === "financial" ? next : order.financialStatus,
      fulfilmentStatus: input.axis === "fulfilment" ? next : order.fulfilmentStatus,
    };
  });

export type TransitionOrderImpl = typeof transitionOrderImpl;
