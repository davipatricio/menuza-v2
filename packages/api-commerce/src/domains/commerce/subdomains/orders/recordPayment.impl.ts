/**
 * Commerce / orders / recordPayment implementation (MEN-92, MEN-95).
 *
 * Idempotent by construction: the `cashback_credited` event is the receipt that
 * the credit already happened, checked inside the same transaction that writes
 * it. Recording on an already-paid order returns the current state and touches
 * nothing, so a retried callback cannot mint cashback twice.
 */
import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject, creditCashback } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import { conflict, notFound, requireCapability, requireMember } from "../../support.ts";

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

    const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

    await db.transaction(async (tx) => {
      const credited = await tx.orm.public.OrderEvent.where({
        tenantId,
        orderId: order.id,
        type: "cashback_credited",
      }).first();

      if (credited) return;

      await tx.orm.public.Order.where({ tenantId, id: order.id }).update({
        financialStatus: "paid",
        paidAt: now,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId,
        orderId: order.id,
        type: "payment_recorded",
        fromValue: order.financialStatus,
        toValue: "paid",
        actorMemberId: member.memberId,
        createdAt: now,
      });

      const wallet = await tx.orm.public.Wallet.where({
        tenantId,
        customerId: order.customerId,
      }).first();

      if (!wallet || order.cashbackCents === 0) return;

      const credit = creditCashback(
        { balanceCents: wallet.balanceCents, transactions: [] },
        {
          orderId: order.id,
          amountCents: order.cashbackCents,
          reason: `Cashback do pedido ${order.code}`,
        },
      );

      if (!credit.ok) throw conflict();

      await tx.orm.public.WalletTransaction.create({
        id: randomUUID(),
        tenantId,
        walletId: wallet.id,
        orderId: order.id,
        kind: credit.entry.kind,
        amountCents: credit.entry.amountCents,
        actorMemberId: member.memberId,
        reason: credit.entry.reason,
        createdAt: now,
      });

      await tx.orm.public.Wallet.where({ tenantId, id: wallet.id }).update({
        balanceCents: credit.balanceCents,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId,
        orderId: order.id,
        type: "cashback_credited",
        fromValue: null,
        toValue: String(order.cashbackCents),
        actorMemberId: member.memberId,
        createdAt: now,
      });
    });

    return { financialStatus: "paid" as const, cashbackCents: order.cashbackCents };
  });

export type RecordOrderPaymentImpl = typeof recordOrderPaymentImpl;
