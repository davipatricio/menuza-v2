/**
 * Commerce / orders / expire implementation (MEN-95).
 *
 * Worker-facing and token-gated (see `orders/router.ts`): no session, no
 * member. Idempotent by order code — a second run on an already-expired order
 * touches nothing.
 *
 * Only an `awaiting_payment` order whose window has actually closed expires; an
 * order paid in the meantime keeps its money. Expiring converts the outstanding
 * reserve for that order into a `reserve_release` and rolls the wallet back, so
 * the customer's credit is not held by a dead order.
 */
import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject, release, releasesStock } from "@menuza/shared/commerce";
import { internalTokenMiddleware } from "@menuza/orpc-server/internal";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db, releaseCouponRedemptions, releaseVariationStock, stockLinesFor } from "@menuza/db";
import { notFound } from "../../support.ts";

const os = implement(
  commerceContractObject.orders.expire,
).$context<RequestHeadersHandlerPluginContext>();

export const expireOrderImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .use(internalTokenMiddleware())
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const order = await db.orm.public.Order.where({ tenantId, code: input.code }).first();

    if (!order) throw notFound();

    if (order.financialStatus !== "awaiting_payment") {
      return { financialStatus: order.financialStatus };
    }

    const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

    // No `expiresAt` means no window was ever opened for this order — a method
    // bound to an `offline` integration, reconciled by the store itself. There
    // is nothing to close, so only an explicit window can expire.
    if (order.expiresAt === null) return { financialStatus: order.financialStatus };

    if (Temporal.PlainDateTime.compare(order.expiresAt, now) > 0) {
      return { financialStatus: order.financialStatus };
    }

    await db.transaction(async (tx) => {
      await tx.orm.public.Order.where({ tenantId, id: order.id }).updateAll({
        financialStatus: "expired",
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId,
        orderId: order.id,
        type: "financial_changed",
        fromValue: order.financialStatus,
        toValue: "expired",
        createdAt: now,
      });

      // The stock goes back when the order dies unpaid: it never reaches the
      // buyer. An order that was already cancelled released its stock then, so
      // it does not release it twice. The coupon follows the same rule — an
      // expired order never became a sale, so its redemption is given back.
      if (!releasesStock(order.fulfilmentStatus, order.financialStatus)) {
        const items = await tx.orm.public.OrderItem.where({ tenantId, orderId: order.id }).all();

        await releaseVariationStock(tx, tenantId, await stockLinesFor(tx, tenantId, items));
      }

      await releaseCouponRedemptions(tx, tenantId, order.id);

      if (order.walletAppliedCents === 0) return;

      // The wallet row is locked, so the release reads the balance the other
      // movement left behind and not the one it raced with.
      const wallet = await tx.orm.public.Wallet.where({
        tenantId,
        customerId: order.customerId,
      })
        .forUpdate()
        .first();

      if (!wallet) return;

      const outstanding = await tx.orm.public.WalletTransaction.where({
        tenantId,
        walletId: wallet.id,
        orderId: order.id,
      }).all();

      const released = release(
        {
          balanceCents: wallet.balanceCents,
          transactions: outstanding.map((row) => ({
            kind: row.kind,
            amountCents: row.amountCents,
            orderId: row.orderId,
            reason: row.reason,
          })),
        },
        {
          orderId: order.id,
          amountCents: order.walletAppliedCents,
          reason: `Reserva liberada no pedido ${order.code}`,
        },
      );

      // Nothing left to release (already spent or released): the order still
      // expires, there is just no money to give back.
      if (!released.ok) return;

      await tx.orm.public.WalletTransaction.create({
        id: randomUUID(),
        tenantId,
        walletId: wallet.id,
        orderId: order.id,
        kind: released.entry.kind,
        amountCents: released.entry.amountCents,
        reason: released.entry.reason,
        createdAt: now,
      });

      await tx.orm.public.Wallet.where({ tenantId, id: wallet.id }).updateAll({
        balanceCents: released.balanceCents,
        updatedAt: now,
      });

      await tx.orm.public.OrderEvent.create({
        id: randomUUID(),
        tenantId,
        orderId: order.id,
        type: "wallet_released",
        fromValue: null,
        toValue: String(order.walletAppliedCents),
        createdAt: now,
      });
    });

    return { financialStatus: "expired" as const };
  });

export type ExpireOrderImpl = typeof expireOrderImpl;
