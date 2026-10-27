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
  type PaymentMethod,
} from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db, reserveVariationStock, stockLinesFor } from "@menuza/db";
import {
  conflict,
  notFound,
  requireCapability,
  requireMember,
  toDate,
  toPlainDateTime,
  validationFailed,
} from "../../support.ts";
import { assertOwnedCatalogIds } from "./catalog.ts";
import { applyCoupons, reserveWallet } from "./money.ts";

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
      paymentMode:
        input.paymentMethod === null
          ? "gateway"
          : await paymentModeFor(tenantId, input.paymentMethod),
      now,
    });

    const orderId = randomUUID();

    const createdAt = toPlainDateTime(now);

    const appliedCoupons = priced.discounts.filter(
      (discount) => discount.source === "coupon" && discount.couponCode !== undefined,
    );

    const code = await insertWithCode(input.code ?? null, async (candidate) => {
      await db.transaction(async (tx) => {
        // The catalog ids are checked before anything is written: a line that
        // names another store's variation would take another store's stock.
        await assertOwnedCatalogIds(tx, tenantId, input.lines);

        // The stock is taken before the order is written, under a row lock, so
        // two checkouts cannot take the same last unit. A variation that ran
        // out is a conflict: the buyer sees the fresh availability.
        const stockLines = await stockLinesFor(tx, tenantId, input.lines);

        const reserved = await reserveVariationStock(tx, tenantId, stockLines);

        if (!reserved.ok) throw conflict();

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

        await applyCoupons(tx, tenantId, orderId, customer.id, appliedCoupons);

        if (priced.walletAppliedCents > 0 && wallet) {
          await reserveWallet(
            tx,
            tenantId,
            orderId,
            wallet.id,
            priced.walletAppliedCents,
            `Reserva aplicada no pedido ${candidate}`,
            member.memberId,
            createdAt,
          );
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
 * Which side closes the payment. A method bound to an `offline` integration is
 * reconciled by the store itself, so `createOrder` gives it no expiry window;
 * a method nobody configured yet keeps the gateway window, because nothing has
 * said the platform should not expect an online confirmation.
 */
async function paymentModeFor(
  tenantId: string,
  method: PaymentMethod,
): Promise<"gateway" | "manual"> {
  const assignment = await db.orm.public.PaymentMethodAssignment.where({
    tenantId,
    method,
  }).first();

  if (!assignment) return "gateway";

  const integration = await db.orm.public.PaymentIntegration.where({
    tenantId,
    id: assignment.integrationId,
  }).first();

  return integration?.provider === "offline" ? "manual" : "gateway";
}

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
