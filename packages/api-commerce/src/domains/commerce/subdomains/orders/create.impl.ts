/**
 * Commerce / orders / create implementation (MEN-96, MEN-97).
 *
 * Checkout is the one place where the pure engine's answer becomes rows. The
 * money is never re-derived here: `createOrder` prices it through `priceOrder`
 * and picks the two status axes plus the opening events; this handler only
 * persists that answer inside one transaction.
 *
 * The redemption uniques are what enforce the coupon limits, so a clash means
 * the limit lost a race and the whole order rolls back as `CONFLICT`.
 */
import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import {
  commerceContractObject,
  createOrder,
  type CouponInput,
  reserve,
} from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import {
  conflict,
  notFound,
  requireCapability,
  requireMember,
  toDate,
  toPlainDateTime,
  validationFailed,
} from "../../support.ts";

const os = implement(
  commerceContractObject.orders.create,
).$context<RequestHeadersHandlerPluginContext>();

/** Base32-ish alphabet without `0/O/1/I`: the code is read aloud and typed by hand. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CODE_LENGTH = 6;

const CODE_ATTEMPTS = 5;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));

  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

type ErrorLike = { message: string };

function isUniqueClash(error: ErrorLike): boolean {
  return /duplicate key|unique constraint/i.test(error.message);
}

export const createOrderImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const member = await requireMember(context.reqHeaders, tenantId);

    requireCapability(member.role, "orders:write");

    const codes = input.couponCodes.map((code) => code.trim().toUpperCase());

    // The same code twice is not a stacking request, it is a bug: replaying a
    // coupon would apply it once and record two redemptions.
    if (new Set(codes).size !== codes.length) throw validationFailed();

    const customer = await db.orm.public.Customer.where({
      tenantId,
      id: input.customerId,
    }).first();

    if (!customer) throw notFound();

    const [wallet, orderCount, couponRows] = await Promise.all([
      db.orm.public.Wallet.where({ tenantId, customerId: customer.id }).first(),
      db.orm.public.Order.where({ tenantId, customerId: customer.id })
        .aggregate((aggregate) => ({ count: aggregate.count() }))
        .then((row) => row.count),
      Promise.all(
        codes.map((code) =>
          db.orm.public.Coupon.where({ tenantId, code, status: "active" }).first(),
        ),
      ),
    ]);

    const coupons: CouponInput[] = [];

    for (const row of couponRows) {
      // An unknown or inactive code is not an error: `priceOrder` reports it as
      // rejected, which is what checkout shows the buyer.
      if (!row) continue;

      const redemptions = await db.orm.public.CouponRedemption.where({
        tenantId,
        couponId: row.id,
        customerId: customer.id,
      })
        .aggregate((aggregate) => ({ count: aggregate.count() }))
        .then((count) => count.count);

      coupons.push({
        id: row.id,
        code: row.code,
        discountType: row.discountType === "percentage" ? "percentage" : "fixed",
        value: row.value,
        minimumOrderCents: row.minimumOrderCents ?? null,
        maximumDiscountCents: row.maximumDiscountCents ?? null,
        shippingDiscountPercent: row.shippingDiscountPercent ?? null,
        startsAt: row.startsAt == null ? null : toDate(row.startsAt),
        endsAt: row.endsAt == null ? null : toDate(row.endsAt),
        stackable: Boolean(row.stackable),
        firstPurchaseOnly: Boolean(row.firstPurchaseOnly),
        usageLimit: row.usageLimit ?? null,
        perCustomerLimit: row.perCustomerLimit ?? null,
        usageCount: row.usageCount,
        customerRedemptionCount: redemptions,
        customerOrderCount: orderCount,
        status: row.status === "expired" ? "expired" : "active",
      });
    }

    const now = new Date();

    const priced = createOrder({
      lines: input.lines.map((line) => ({
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        catalogDiscountCents: line.catalogDiscountCents,
      })),
      shippingCents: input.shippingCents,
      walletRequestedCents: input.walletRequestedCents,
      walletAvailableCents: wallet?.balanceCents ?? 0,
      coupons,
      paymentMethod: input.paymentMethod,
      now,
    });

    const orderId = randomUUID();

    const createdAt = toPlainDateTime(now);

    const appliedCoupons = priced.discounts.filter(
      (discount) => discount.source === "coupon" && discount.couponCode !== undefined,
    );

    const code = await insertWithCode(input.code ?? null, async (candidate) => {
      await db.transaction(async (tx) => {
        await tx.orm.public.Order.create({
          id: orderId,
          tenantId,
          code: candidate,
          customerId: customer.id,
          subtotalCents: priced.subtotalCents,
          discountCents: priced.discountCents,
          shippingCents: priced.shippingCents,
          walletAppliedCents: priced.walletAppliedCents,
          cashbackCents: priced.cashbackCents,
          totalCents: priced.totalCents,
          financialStatus: priced.financialStatus,
          fulfilmentStatus: priced.fulfilmentStatus,
          paymentMethod: input.paymentMethod,
          expiresAt: priced.expiresAt === null ? null : toPlainDateTime(priced.expiresAt),
          couponId: appliedCoupons[0]?.couponId ?? null,
          createdAt,
          updatedAt: createdAt,
        });

        for (const line of input.lines) {
          await tx.orm.public.OrderItem.create({
            id: randomUUID(),
            tenantId,
            orderId,
            productId: line.productId ?? null,
            variationId: line.variationId ?? null,
            kitId: line.kitId ?? null,
            name: line.name,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            lineTotalCents: line.unitPriceCents * line.quantity,
          });
        }

        for (const event of priced.events) {
          await tx.orm.public.OrderEvent.create({
            id: randomUUID(),
            tenantId,
            orderId,
            type: event.type,
            fromValue: event.fromValue,
            toValue: event.toValue,
            actorMemberId: member.memberId,
            createdAt,
          });
        }

        for (const discount of appliedCoupons) {
          const couponId = discount.couponId;
          const couponCode = discount.couponCode;

          if (couponId === undefined || couponCode === undefined) continue;

          await tx.orm.public.CouponRedemption.create({
            id: randomUUID(),
            tenantId,
            couponId,
            orderId,
            customerId: customer.id,
            discountCents: discount.amountCents,
          });

          const usageCount = coupons.find((coupon) => coupon.id === couponId)?.usageCount ?? 0;

          await tx.orm.public.Coupon.where({ tenantId, id: couponId }).update({
            usageCount: usageCount + 1,
          });
        }

        if (priced.walletAppliedCents > 0 && wallet) {
          // The wallet is the only balance that can refuse: `priceOrder` already
          // clamped the request to what is available, so a refusal here is a
          // concurrent spend and the order cannot be created.
          const applied = reserve(
            { balanceCents: wallet.balanceCents, transactions: [] },
            {
              orderId,
              amountCents: priced.walletAppliedCents,
              reason: `Reserva aplicada no pedido ${candidate}`,
            },
          );

          if (!applied.ok) throw conflict();

          await tx.orm.public.WalletTransaction.create({
            id: randomUUID(),
            tenantId,
            walletId: wallet.id,
            orderId,
            kind: applied.entry.kind,
            amountCents: applied.entry.amountCents,
            actorMemberId: member.memberId,
            reason: applied.entry.reason,
            createdAt,
          });

          await tx.orm.public.Wallet.where({ tenantId, id: wallet.id }).update({
            balanceCents: applied.balanceCents,
            updatedAt: createdAt,
          });
        }
      });
    });

    return {
      id: orderId,
      code,
      subtotalCents: priced.subtotalCents,
      discountCents: priced.discountCents,
      shippingCents: priced.shippingCents,
      walletAppliedCents: priced.walletAppliedCents,
      cashbackCents: priced.cashbackCents,
      totalCents: priced.totalCents,
      financialStatus: priced.financialStatus,
      fulfilmentStatus: priced.fulfilmentStatus,
      expiresAt: priced.expiresAt === null ? null : priced.expiresAt.toISOString(),
      rejectedCoupons: priced.rejectedCoupons.map((rejected) => ({
        code: rejected.code,
        reason: rejected.reason,
      })),
    };
  });

/**
 * Inserts under `requested`, or under a fresh generated code retrying a clash.
 * A requested code that clashes is the caller's mistake, so it fails at once.
 */
async function insertWithCode(
  requested: string | null,
  insert: (code: string) => Promise<void>,
): Promise<string> {
  const attempts = requested === null ? CODE_ATTEMPTS : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = requested ?? generateCode();

    try {
      await insert(code);

      return code;
    } catch (error) {
      if (!(error instanceof Error) || !isUniqueClash(error)) throw error;

      if (attempt === attempts - 1) throw conflict();
    }
  }

  throw conflict();
}

export type CreateOrderImpl = typeof createOrderImpl;
