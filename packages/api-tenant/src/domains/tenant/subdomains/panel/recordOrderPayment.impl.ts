/**
 * `panel.recordOrderPayment` (MEN-264).
 *
 * Idempotent by construction: the `cashback_credited` event is the receipt that
 * the credit already happened, checked inside the same transaction that writes
 * it. Recording on an already-paid order returns the current state and touches
 * nothing, so a retried click cannot mint cashback twice.
 */
import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { creditCashback } from "@menuza/shared/commerce";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { conflict, notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { actorOf, transitionsOf } from "./orderOps.ts";

const os = implement(
  tenantContractObject.panel.recordOrderPayment,
).$context<RequestHeadersHandlerPluginContext>();

export const recordOrderPaymentImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "orders:write");

  const order = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where({ tenantId: store.tenantId, code: input.orderCode }).first(),
  );

  if (!order) throw notFound();

  const actor = actorOf(store.session.memberId, store.role);

  if (order.financialStatus === "paid") {
    return {
      financialStatus: order.financialStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      transitions: transitionsOf(order, actor),
    };
  }

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      const credited = await tx.orm.public.OrderEvent.where({
        tenantId: store.tenantId,
        orderId: order.id,
        type: "cashback_credited",
      }).first();

      if (credited) return;

      await tx.orm.public.Order.where({ tenantId: store.tenantId, id: order.id }).update({
        financialStatus: "paid",
        paidAt: now,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        orderId: order.id,
        type: "payment_recorded",
        fromValue: order.financialStatus,
        toValue: "paid",
        actorMemberId: store.session.memberId,
        createdAt: now,
      });

      if (order.cashbackCents === 0) return;

      const wallet = await tx.orm.public.Wallet.where({
        tenantId: store.tenantId,
        customerId: order.customerId,
      }).first();

      if (!wallet) return;

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
        tenantId: store.tenantId,
        walletId: wallet.id,
        orderId: order.id,
        kind: credit.entry.kind,
        amountCents: credit.entry.amountCents,
        actorMemberId: store.session.memberId,
        reason: credit.entry.reason,
        createdAt: now,
      });

      await tx.orm.public.Wallet.where({ tenantId: store.tenantId, id: wallet.id }).update({
        balanceCents: credit.balanceCents,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        orderId: order.id,
        type: "cashback_credited",
        fromValue: null,
        toValue: String(order.cashbackCents),
        actorMemberId: store.session.memberId,
        createdAt: now,
      });
    }),
  );

  return {
    financialStatus: "paid" as const,
    fulfilmentStatus: order.fulfilmentStatus,
    transitions: transitionsOf(
      { financialStatus: "paid", fulfilmentStatus: order.fulfilmentStatus },
      actor,
    ),
  };
});

export type RecordOrderPaymentImpl = typeof recordOrderPaymentImpl;
