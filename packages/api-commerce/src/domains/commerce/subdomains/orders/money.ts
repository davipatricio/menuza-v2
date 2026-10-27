/**
 * The money an order takes, written under the locks that keep it honest.
 *
 * Both the coupon counter and the wallet balance are read-modify-write: the
 * price was computed from a snapshot, and a concurrent checkout may have moved
 * either of them since. So the row is locked and read again here, and a value
 * that no longer covers the price is a conflict — the buyer re-prices and the
 * order is either the same one or nothing.
 */
import { randomUUID } from "node:crypto";

import { creditCashback, reserve, type AppliedDiscount } from "@menuza/shared/commerce";
import type { DbTransaction } from "@menuza/db";

import { conflict } from "../../support.ts";

/** Records the coupon redemptions of an order and counts each coupon up. */
export async function applyCoupons(
  tx: DbTransaction,
  tenantId: string,
  orderId: string,
  customerId: string,
  appliedCoupons: readonly AppliedDiscount[],
): Promise<void> {
  for (const discount of appliedCoupons) {
    const couponId = discount.couponId;
    const couponCode = discount.couponCode;

    if (couponId === undefined || couponCode === undefined) continue;

    const locked = await tx.orm.public.Coupon.where({ tenantId, id: couponId }).forUpdate().first();

    if (!locked) throw conflict();

    if (locked.usageLimit !== null && locked.usageCount >= locked.usageLimit) {
      throw conflict();
    }

    await tx.orm.public.CouponRedemption.create({
      id: randomUUID(),
      tenantId,
      couponId,
      orderId,
      customerId,
      discountCents: discount.amountCents,
    });

    await tx.orm.public.Coupon.where({ tenantId, id: couponId }).updateAll({
      usageCount: locked.usageCount + 1,
    });
  }
}

/** Reserves the wallet credit the order applied, and writes the movement. */
export async function reserveWallet(
  tx: DbTransaction,
  tenantId: string,
  orderId: string,
  walletId: string,
  amountCents: number,
  reason: string,
  actorMemberId: string,
  createdAt: Temporal.PlainDateTime,
): Promise<void> {
  const locked = await tx.orm.public.Wallet.where({ tenantId, id: walletId }).forUpdate().first();

  if (!locked) throw conflict();

  // The wallet is the only balance that can refuse: `priceOrder` already
  // clamped the request to what was available, so a refusal here is a
  // concurrent spend and the order cannot be created.
  const applied = reserve(
    { balanceCents: locked.balanceCents, transactions: [] },
    { orderId, amountCents, reason },
  );

  if (!applied.ok) throw conflict();

  await tx.orm.public.WalletTransaction.create({
    id: randomUUID(),
    tenantId,
    walletId: locked.id,
    orderId,
    kind: applied.entry.kind,
    amountCents: applied.entry.amountCents,
    actorMemberId,
    reason: applied.entry.reason,
    createdAt,
  });

  await tx.orm.public.Wallet.where({ tenantId, id: locked.id }).updateAll({
    balanceCents: applied.balanceCents,
    updatedAt: createdAt,
  });
}

/** The columns of an order that becoming paid reads. */
export interface PaidOrder {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly customerId: string;
  readonly cashbackCents: number;
  readonly financialStatus: string;
}

export interface MarkOrderPaidOptions {
  /** Null when a gateway confirmed the payment instead of a store member. */
  readonly actorMemberId: string | null;
  /** Why the money landed, recorded on the `payment_recorded` event. */
  readonly reason: string | null;
}

/**
 * The one place an order becomes paid: stamps the status, appends the event and
 * credits the cashback.
 *
 * Idempotent by construction — the `cashback_credited` event is the receipt
 * that the credit already happened, read inside the same transaction that
 * writes it. A retried member action and a replayed gateway webhook therefore
 * both land here and neither can mint cashback twice.
 *
 * Money already taken leaves only through `refunded` (PRODUCT.md §10), which is
 * a different transition and not this helper's business.
 */
export async function markOrderPaid(
  tx: DbTransaction,
  order: PaidOrder,
  options: MarkOrderPaidOptions,
): Promise<void> {
  const credit = await creditOrderCashback(tx, order, options.actorMemberId);

  if (credit === "already_credited") return;

  const at = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  await tx.orm.public.Order.where({ tenantId: order.tenantId, id: order.id }).updateAll({
    financialStatus: "paid",
    paidAt: at,
    updatedAt: at,
  });

  await tx.orm.public.OrderEvent.create({
    id: randomUUID(),
    tenantId: order.tenantId,
    orderId: order.id,
    type: "payment_recorded",
    fromValue: order.financialStatus,
    toValue: "paid",
    actorMemberId: options.actorMemberId,
    reason: options.reason,
    createdAt: at,
  });
}

/**
 * Credits the order's cashback once, under a wallet row lock. Returns
 * `already_credited` when the receipt exists, so the caller can stop without
 * touching the order either.
 */
async function creditOrderCashback(
  tx: DbTransaction,
  order: PaidOrder,
  actorMemberId: string | null,
): Promise<"credited" | "already_credited"> {
  const receipt = await tx.orm.public.OrderEvent.where({
    tenantId: order.tenantId,
    orderId: order.id,
    type: "cashback_credited",
  }).first();

  if (receipt) return "already_credited";

  // The wallet row is locked, so a cashback credited here cannot race another
  // credit into the same balance.
  const wallet = await tx.orm.public.Wallet.where({
    tenantId: order.tenantId,
    customerId: order.customerId,
  })
    .forUpdate()
    .first();

  if (!wallet || order.cashbackCents === 0) return "credited";

  const applied = creditCashback(
    { balanceCents: wallet.balanceCents, transactions: [] },
    {
      orderId: order.id,
      amountCents: order.cashbackCents,
      reason: `Cashback do pedido ${order.code}`,
    },
  );

  if (!applied.ok) throw conflict();

  const at = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  await tx.orm.public.WalletTransaction.create({
    id: randomUUID(),
    tenantId: order.tenantId,
    walletId: wallet.id,
    orderId: order.id,
    kind: applied.entry.kind,
    amountCents: applied.entry.amountCents,
    actorMemberId,
    reason: applied.entry.reason,
    createdAt: at,
  });

  await tx.orm.public.Wallet.where({ tenantId: order.tenantId, id: wallet.id }).updateAll({
    balanceCents: applied.balanceCents,
    updatedAt: at,
  });

  await tx.orm.public.OrderEvent.create({
    id: randomUUID(),
    tenantId: order.tenantId,
    orderId: order.id,
    type: "cashback_credited",
    fromValue: null,
    toValue: String(order.cashbackCents),
    actorMemberId,
    createdAt: at,
  });

  return "credited";
}
