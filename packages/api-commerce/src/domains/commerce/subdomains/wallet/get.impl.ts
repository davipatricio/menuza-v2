/**
 * Commerce / wallet / get implementation (MEN-92).
 *
 * The stored balance and the signed ledger that produced it. The whole history
 * is returned rather than a page: a customer wallet has one row per order, and
 * paging it would hide the total the balance is a rollup of.
 */
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import { isoOf, notFound, requireCapability, requireMember } from "../../support.ts";

const os = implement(
  commerceContractObject.wallet.get,
).$context<RequestHeadersHandlerPluginContext>();

export const getWalletImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const member = await requireMember(context.reqHeaders, tenantId);

    requireCapability(member.role, "orders:read");

    const customer = await db.orm.public.Customer.where({
      tenantId,
      id: input.customerId,
    }).first();

    if (!customer) throw notFound();

    const wallet = await db.orm.public.Wallet.where({
      tenantId,
      customerId: customer.id,
    }).first();

    // A customer with no wallet yet has no balance, not an error.
    if (!wallet) return { balanceCents: 0, transactions: [] };

    const rows = await db.orm.public.WalletTransaction.where({
      tenantId,
      walletId: wallet.id,
    })
      .orderBy((transaction) => transaction.createdAt.desc())
      .all();

    return {
      balanceCents: wallet.balanceCents,
      transactions: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amountCents: row.amountCents,
        orderId: row.orderId ?? null,
        reason: row.reason ?? null,
        createdAt: isoOf(row.createdAt),
      })),
    };
  });

export type GetWalletImpl = typeof getWalletImpl;
