/**
 * `panel.transitionOrder` (MEN-264).
 *
 * Staff move an order through the management API because the commerce
 * `orders.transition` needs a buyer session that does not exist yet. The rules
 * are the shared pure table (`applyTransition`): this handler loads the current
 * row, asks the engine, then writes both axes, the event — and, on a refund, the
 * cashback clawback — in ONE transaction.
 */
import { randomUUID } from "node:crypto";
import { ORPCError, implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { applyTransition, releasesStock, reversal } from "@menuza/shared/commerce";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db, releaseVariationStock, stockLinesFor } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { actorOf, transitionsOf } from "./orderOps.ts";

const os = implement(
  tenantContractObject.panel.transitionOrder,
).$context<RequestHeadersHandlerPluginContext>();

export const transitionOrderImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, input.to === "refunded" ? "orders:refund" : "orders:write");

  const order = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where({ tenantId: store.tenantId, code: input.orderCode }).first(),
  );

  if (!order) throw notFound();

  const actor = actorOf(store.session.memberId, store.role);
  const from = input.axis === "financial" ? order.financialStatus : order.fulfilmentStatus;

  const applied = applyTransition(
    { axis: input.axis, from, to: input.to, reason: input.reason ?? null },
    actor,
  );

  if (!applied.ok) throw transitionError(applied.reason, from, input.to);

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  // SAFETY: the engine approved this tuple on this axis, and every `to` in the
  // table is one of the column's own slugs, so the cast is the table's promise.
  const next = input.to as typeof order.financialStatus & typeof order.fulfilmentStatus;

  const financialStatus = input.axis === "financial" ? next : order.financialStatus;
  const fulfilmentStatus = input.axis === "fulfilment" ? next : order.fulfilmentStatus;

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      await tx.orm.public.Order.where({ tenantId: store.tenantId, id: order.id }).updateAll({
        financialStatus,
        fulfilmentStatus,
        // Paying is the money landing: `paidAt` is written once and never moves.
        paidAt: financialStatus === "paid" && order.paidAt === null ? now : order.paidAt,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        orderId: order.id,
        type: input.axis === "financial" ? "financial_changed" : "fulfilment_changed",
        fromValue: from,
        toValue: input.to,
        actorMemberId: store.session.memberId,
        reason: input.reason ?? null,
        createdAt: now,
      });

      // The stock goes back on the edge into a state the order never leaves:
      // a cancelled order never reaches the buyer. Comparing the pair before
      // and after is what makes the release happen once, even when the order
      // is later expired as well.
      const wasReleased = releasesStock(order.fulfilmentStatus, order.financialStatus);

      const isReleased = releasesStock(fulfilmentStatus, financialStatus);

      if (!wasReleased && isReleased) {
        const items = await tx.orm.public.OrderItem.where({
          tenantId: store.tenantId,
          orderId: order.id,
        }).all();

        await releaseVariationStock(
          tx,
          store.tenantId,
          await stockLinesFor(tx, store.tenantId, items),
        );
      }

      if (input.to !== "refunded" || order.cashbackCents === 0) return;

      // The wallet row is locked, so the clawback reads the balance the other
      // movement left behind and not the one it raced with.
      const wallet = await tx.orm.public.Wallet.where({
        tenantId: store.tenantId,
        customerId: order.customerId,
      })
        .forUpdate()
        .first();

      if (!wallet) return;

      // `reversal` caps the clawback at the available balance and reports the
      // shortfall, so a customer who already spent the credit lands at zero
      // instead of tripping the wallet's non-negative CHECK.
      const clawback = reversal(
        { balanceCents: wallet.balanceCents, transactions: [] },
        {
          orderId: order.id,
          amountCents: order.cashbackCents,
          reason: `Estorno do cashback do pedido ${order.code}`,
        },
      );

      // Nothing left to take means nothing to write; the refund itself stands.
      if (!clawback.ok) return;

      await tx.orm.public.WalletTransaction.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        walletId: wallet.id,
        orderId: order.id,
        kind: clawback.entry.kind,
        amountCents: clawback.entry.amountCents,
        actorMemberId: store.session.memberId,
        reason: clawback.entry.reason,
        createdAt: now,
      });

      await tx.orm.public.Wallet.where({ tenantId: store.tenantId, id: wallet.id }).updateAll({
        balanceCents: clawback.balanceCents,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        orderId: order.id,
        type: "cashback_reversed",
        fromValue: String(order.cashbackCents),
        toValue: String(clawback.shortfallCents),
        actorMemberId: store.session.memberId,
        createdAt: now,
      });
    }),
  );

  return {
    financialStatus,
    fulfilmentStatus,
    transitions: transitionsOf({ financialStatus, fulfilmentStatus }, actor),
  };
});

/** The engine's three refusals, mapped to the contract's own codes. */
function transitionError(reason: string, from: string, to: string) {
  if (reason === "forbidden") {
    return new ORPCError("FORBIDDEN", {
      message: sharedErrorCodes.FORBIDDEN.message,
      data: { code: "FORBIDDEN" },
    });
  }

  if (reason === "reason_required") {
    return new ORPCError("REASON_REQUIRED", { message: "Esta transição exige um motivo." });
  }

  return new ORPCError("ORDER_TRANSITION_INVALID", {
    message: "Transição de pedido não permitida.",
    data: { reason: `${from} -> ${to}` },
  });
}

export type TransitionOrderImpl = typeof transitionOrderImpl;
