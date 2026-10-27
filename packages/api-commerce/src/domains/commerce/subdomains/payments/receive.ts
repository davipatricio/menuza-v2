/**
 * Inbound gateway callbacks, before any order is touched.
 *
 * The receiver authenticates, decodes, records and enqueues — nothing else.
 * Applying the event to an order is `applyGatewayEvent`, which the worker calls
 * over the internal token, so a slow database or a retried job never holds the
 * provider's request open.
 *
 * Ordering matters for crash safety: the event row is written **before** the
 * enqueue. If the enqueue fails the route answers 500, the provider retries,
 * the retry finds the existing row and enqueues the same deterministic job id,
 * which BullMQ collapses. No event is lost and none is applied twice.
 */
import { randomUUID } from "node:crypto";
import { decryptSecret } from "@menuza/orpc-server/crypto";
import { db, unscoped, withTenant } from "@menuza/db";
import type { PaymentJobPayload } from "@menuza/shared/commerce";
import {
  parsePagarMeCredentials,
  parsePagarMeEvent,
  verifyPagarMeAuthorization,
} from "./pagarme.ts";

export interface PaymentWebhookRequest {
  /** The opaque integration token from the callback URL. */
  readonly token: string;
  /** The provider's `Authorization` header, when it sends one. */
  readonly authorization: string | null;
  readonly rawBody: string;
  readonly enqueue: (payload: PaymentJobPayload) => Promise<void>;
}

export interface PaymentWebhookResult {
  readonly status: 200 | 400 | 401 | 404;
  readonly received: boolean;
}

/**
 * The token is the only thing the caller has, so this one lookup is the
 * documented `unscoped()` escape hatch — the same one the host→`Domain`
 * resolution uses. Everything after it runs inside the tenant scope the row
 * names, with an explicit `where.tenantId`.
 */
export async function acceptPaymentWebhook(
  request: PaymentWebhookRequest,
): Promise<PaymentWebhookResult> {
  const integration = await unscoped(() =>
    db.orm.public.PaymentIntegration.where({
      webhookToken: request.token,
      status: "active",
    }).first(),
  );

  // An unknown token and a disabled integration are the same answer: the caller
  // learns nothing about which tokens exist.
  if (!integration || integration.provider !== "pagarme") {
    return { status: 404, received: false };
  }

  if (
    request.authorization !== null &&
    !authorizes(request.authorization, integration.credentials)
  ) {
    return { status: 401, received: false };
  }

  const event = parsePagarMeEvent(request.rawBody);

  if (!event) return { status: 400, received: false };

  const tenantId = integration.tenantId;

  const gatewayEventId = await withTenant(tenantId, async () => {
    const existing = await db.orm.public.GatewayEvent.where({
      tenantId,
      provider: "pagarme",
      externalId: event.externalId,
    }).first();

    if (existing) return existing.id;

    const id = randomUUID();

    await db.orm.public.GatewayEvent.create({
      id,
      tenantId,
      integrationId: integration.id,
      provider: "pagarme",
      externalId: event.externalId,
      type: event.type,
      orderCode: event.orderCode,
      amountCents: event.amountCents,
      status: "received",
      receivedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    return id;
  });

  await request.enqueue({ tenantId, gatewayEventId });

  return { status: 200, received: true };
}

/**
 * A stored credential that cannot be decrypted is an operational fault, not a
 * wrong caller: it throws (500) so it reaches the logs instead of quietly
 * turning into a 401 the provider would keep retrying.
 */
function authorizes(header: string, credentials: string | null): boolean {
  if (credentials === null) return false;

  const { secretKey } = parsePagarMeCredentials(decryptSecret(credentials));

  return verifyPagarMeAuthorization(header, secretKey);
}
