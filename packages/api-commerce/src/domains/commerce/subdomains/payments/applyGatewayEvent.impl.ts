/**
 * Commerce / payments / applyGatewayEvent implementation.
 *
 * The worker-facing half of a gateway callback. It runs after the event is
 * already persisted and queued, and it is idempotent on both sides: an event
 * that reached a terminal status is answered from the row, and `markOrderPaid`
 * refuses to credit the cashback twice if the same `paid` event is applied
 * again.
 *
 * Only `paid` moves an order. A declined payment is recorded and the order
 * keeps its window, because PRODUCT.md §10 lets the buyer retry or switch
 * method on the same order. Cancellations, refunds and chargebacks are recorded
 * and ignored: each one touches stock or wallet money the store owns through
 * the panel, and a callback must not do that behind its back.
 */
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject } from "@menuza/shared/commerce";
import { internalTokenMiddleware } from "@menuza/orpc-server/internal";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import { markOrderPaid, type PaidOrder } from "../orders/money.ts";
import { mapPagarMeEventType } from "./pagarme.ts";

const os = implement(
  commerceContractObject.payments.applyGatewayEvent,
).$context<RequestHeadersHandlerPluginContext>();

type Outcome = "applied" | "ignored" | "rejected" | "missing";

type Settled = "processed" | "ignored" | "rejected";

/** Conflict markers for an event that has already been decided. */
const ALREADY_DECIDED = new Map<string, Outcome>([
  ["processed", "applied"],
  ["ignored", "ignored"],
  ["rejected", "rejected"],
]);

const OUTCOME_OF = new Map<Settled, Outcome>([
  ["processed", "applied"],
  ["ignored", "ignored"],
  ["rejected", "rejected"],
]);

export const applyGatewayEventImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .use(internalTokenMiddleware())
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    const event = await db.orm.public.GatewayEvent.where({
      tenantId,
      id: input.gatewayEventId,
    }).first();

    if (!event) return { status: "missing" as const };

    const decided = ALREADY_DECIDED.get(event.status);

    if (decided !== undefined) return { status: decided };

    const instruction = await decide(tenantId, event);

    if (instruction.kind === "settle") {
      return settle(tenantId, event.id, instruction.status, instruction.detail);
    }

    await db.transaction((tx) =>
      markOrderPaid(tx, instruction.order, {
        actorMemberId: null,
        reason: `Confirmado pelo provedor (${event.type}).`,
      }),
    );

    return settle(tenantId, event.id, "processed", null);
  });

/** The columns of a received event this decision reads. */
interface GatewayEventRow {
  readonly id: string;
  readonly provider: string;
  readonly type: string;
  readonly orderCode: string | null;
  readonly amountCents: number | null;
}

type Instruction =
  | { readonly kind: "settle"; readonly status: Settled; readonly detail: string }
  | { readonly kind: "pay"; readonly order: PaidOrder };

/**
 * Turns one event into either "close it with this status" or "mark this order
 * paid". Every refusal is a settled event, never a thrown error: an event the
 * platform will not act on is still information the store needs to see.
 */
async function decide(tenantId: string, event: GatewayEventRow): Promise<Instruction> {
  const action = event.provider === "pagarme" ? mapPagarMeEventType(event.type) : "ignored";

  if (action === "ignored") {
    return close("ignored", "Evento sem efeito sobre o pedido.");
  }

  if (event.orderCode === null) {
    return close("ignored", "Evento sem código de pedido.");
  }

  const order = await db.orm.public.Order.where({ tenantId, code: event.orderCode }).first();

  if (!order) {
    return close("ignored", "Pedido não encontrado nesta loja.");
  }

  if (action === "payment_failed") {
    // Not terminal: the buyer may retry or switch method (PRODUCT.md §10), so
    // the order keeps both its status and its window.
    return close("processed", "Pagamento recusado; o pedido segue aguardando.");
  }

  // The amount is the one thing a callback must not be trusted about blindly:
  // a confirmation for a different amount would mark the wrong money as paid.
  if (event.amountCents !== null && event.amountCents !== order.totalCents) {
    return close(
      "rejected",
      `Valor divergente: recebido ${event.amountCents}, esperado ${order.totalCents}.`,
    );
  }

  return { kind: "pay", order };
}

function close(status: Settled, detail: string): Instruction {
  return { kind: "settle", status, detail };
}

/** Writes the event's terminal status and answers with its outcome. */
async function settle(
  tenantId: string,
  gatewayEventId: string,
  status: Settled,
  detail: string | null,
): Promise<{ status: Outcome }> {
  await db.orm.public.GatewayEvent.where({ tenantId, id: gatewayEventId }).updateAll({
    status,
    detail,
    processedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
  });

  return { status: OUTCOME_OF.get(status) ?? "applied" };
}

export type ApplyGatewayEventImpl = typeof applyGatewayEventImpl;
