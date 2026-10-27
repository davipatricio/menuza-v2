/**
 * Commerce / wallet / adjust implementation (MEN-92).
 *
 * The operator's manual correction: a store credit or a clawback, with a
 * mandatory reason. `adjust` takes the sign from the caller, so the same
 * procedure covers both directions; the pure ledger is what refuses a
 * negative balance, and that refusal is a `CONFLICT`, not a 500.
 */
import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { adjust, commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import { conflict, notFound, requireCapability, requireMember } from "../../support.ts";

const os = implement(
  commerceContractObject.wallet.adjust,
).$context<RequestHeadersHandlerPluginContext>();

export const adjustWalletImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const member = await requireMember(context.reqHeaders, tenantId);

    requireCapability(member.role, "wallet:adjust");

    const customer = await db.orm.public.Customer.where({
      tenantId,
      id: input.customerId,
    }).first();

    if (!customer) throw notFound();

    const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

    const balanceCents = await db.transaction(async (tx) => {
      // A customer without a wallet is not an error: the balance is 0 and the
      // adjustment opens the wallet, which is what a first store credit is.
      // The row is locked, so two adjustments cannot both read the same
      // balance and the second one cannot silently overwrite the first.
      const wallet = await tx.orm.public.Wallet.where({
        tenantId,
        customerId: customer.id,
      })
        .forUpdate()
        .first();

      const walletId =
        wallet?.id ??
        (
          await tx.orm.public.Wallet.create({
            id: randomUUID(),
            tenantId,
            customerId: customer.id,
            balanceCents: 0,
            createdAt: now,
            updatedAt: now,
          })
        ).id;

      const adjusted = adjust(
        { balanceCents: wallet?.balanceCents ?? 0, transactions: [] },
        { orderId: null, amountCents: input.amountCents, reason: input.reason },
      );

      if (!adjusted.ok) throw conflict();

      await tx.orm.public.WalletTransaction.create({
        id: randomUUID(),
        tenantId,
        walletId,
        orderId: null,
        kind: adjusted.entry.kind,
        amountCents: adjusted.entry.amountCents,
        actorMemberId: member.memberId,
        reason: adjusted.entry.reason,
        createdAt: now,
      });

      await tx.orm.public.Wallet.where({ tenantId, id: walletId }).updateAll({
        balanceCents: adjusted.balanceCents,
        updatedAt: now,
      });

      return adjusted.balanceCents;
    });

    return { balanceCents };
  });

export type AdjustWalletImpl = typeof adjustWalletImpl;
