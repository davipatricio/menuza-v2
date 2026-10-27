/**
 * Commerce / orders / recordPayment implementation (MEN-92, MEN-95).
 *
 * The store arm of "the money landed". A gateway webhook takes the same path
 * through `markOrderPaid`, so a manual record and a provider confirmation can
 * never disagree about the cashback: the `cashback_credited` event is the
 * receipt that the credit already happened, checked inside the same transaction
 * that writes it. Recording on an already-paid order returns the current state
 * and touches nothing.
 */
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import { notFound, requireCapability, requireMember } from "../../support.ts";
import { markOrderPaid } from "./money.ts";

const os = implement(
  commerceContractObject.orders.recordPayment,
).$context<RequestHeadersHandlerPluginContext>();

export const recordOrderPaymentImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const member = await requireMember(context.reqHeaders, tenantId);

    requireCapability(member.role, "orders:write");

    const order = await db.orm.public.Order.where({ tenantId, code: input.code }).first();

    if (!order) throw notFound();

    if (order.financialStatus === "paid") {
      return { financialStatus: order.financialStatus, cashbackCents: order.cashbackCents };
    }

    await db.transaction((tx) =>
      markOrderPaid(tx, order, { actorMemberId: member.memberId, reason: null }),
    );

    return { financialStatus: "paid" as const, cashbackCents: order.cashbackCents };
  });

export type RecordOrderPaymentImpl = typeof recordOrderPaymentImpl;
