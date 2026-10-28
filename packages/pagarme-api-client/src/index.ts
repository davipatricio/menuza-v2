/**
 * Pagar.me Core API v5 client and webhook adapter.
 *
 * Reusable across Menuza server packages.
 *
 * Two halves:
 * - **Inbound**: the webhook parser and the event -> action map, plus Basic-auth verification.
 * - **Outbound**: `pagarMeRequest`, the Basic-auth transport called to interact with Core API v5.
 *
 * Core facts:
 * - Base URL `https://api.pagar.me/core/v5`
 * - HTTP Basic, secret key (`sk_...`) as the username, empty password
 * - Amounts are integer cents
 * - The merchant's own order identifier travels in `code` (max 52 chars)
 */
import { timingSafeEqual } from "node:crypto";
import * as v from "valibot";

export const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

/** What a Pagar.me secret key looks like; the public key (`pk_...`) is not one. */
const PAGARME_SECRET_PREFIX = "sk_";

/**
 * The envelope, read permissively: unknown keys are ignored (valibot's `object`
 * strips them) and every field inside `data` is optional, because the shape
 * differs per event type.
 */
const PagarMeWebhookSchema = v.object({
  type: v.pipe(v.string(), v.nonEmpty()),
  id: v.optional(v.pipe(v.string(), v.nonEmpty())),
  data: v.optional(
    v.object({
      id: v.optional(v.string()),
      code: v.optional(v.string()),
      amount: v.optional(v.number()),
      order: v.optional(
        v.object({
          id: v.optional(v.string()),
          code: v.optional(v.string()),
          amount: v.optional(v.number()),
        }),
      ),
    }),
  ),
});

export interface PagarMeEvent {
  /** Idempotency key: the provider's own event id. */
  readonly externalId: string;
  readonly type: string;
  /** The store's order code, as sent in the `code` field when the order was created. */
  readonly orderCode: string | null;
  /** Integer cents, when the event carries an amount. */
  readonly amountCents: number | null;
}

/**
 * Decodes a raw webhook body. Returns `null` for anything that is not JSON or
 * does not carry an id and a type - the receiver answers 400 so Pagar.me
 * retries, rather than silently dropping a confirmation.
 */
export function parsePagarMeEvent(rawBody: string): PagarMeEvent | null {
  try {
    const parsed = v.safeParse(PagarMeWebhookSchema, JSON.parse(rawBody));

    if (!parsed.success) return null;

    const { type, id, data } = parsed.output;

    const externalId = id ?? data?.id;

    if (externalId === undefined) return null;

    return {
      externalId,
      type,
      orderCode: data?.order?.code ?? data?.code ?? null,
      amountCents: data?.order?.amount ?? data?.amount ?? null,
    };
  } catch {
    return null;
  }
}

export type PagarMeAction = "paid" | "payment_failed" | "ignored";

/**
 * The only event that moves an order, plus the one that is worth recording as a
 * signal. Everything else - refunds, chargebacks, cancellations, antifraud,
 * subscriptions - is recorded and ignored.
 *
 * Cancelling, refunding and chargeback handling each touch money the platform
 * has to account for (wallet reserves, stock, the commission base), and the
 * store already owns those paths in the panel. A callback must not take them
 * behind the store's back; the event stays in the trail for the exception queue.
 */
const EVENT_ACTIONS = new Map<string, PagarMeAction>([
  ["order.paid", "paid"],
  ["charge.paid", "paid"],
  ["order.payment_failed", "payment_failed"],
  ["charge.payment_failed", "payment_failed"],
]);

export function mapPagarMeEventType(type: string): PagarMeAction {
  return EVENT_ACTIONS.get(type) ?? "ignored";
}

/**
 * Checks a webhook `Authorization: Basic` header against the stored secret key.
 *
 * Pagar.me authenticates the callback with the account's own key. The receiver
 * only calls this when the header is present: the URL token is the primary
 * credential, so an account that sends no header still works.
 */
export function verifyPagarMeAuthorization(header: string, secretKey: string): boolean {
  const scheme = "Basic ";

  if (!header.startsWith(scheme)) return false;

  const decoded = Buffer.from(header.slice(scheme.length), "base64").toString("utf8");

  const separator = decoded.indexOf(":");

  const user = separator === -1 ? decoded : decoded.slice(0, separator);

  const expected = Buffer.from(secretKey, "utf8");

  const actual = Buffer.from(user, "utf8");

  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

export interface PagarMeCredentials {
  readonly secretKey: string;
}

/** Reads the credential blob a panel save wrote. Throws on a malformed row. */
export function parsePagarMeCredentials(plaintext: string): PagarMeCredentials {
  const parsed = v.safeParse(
    v.object({ secretKey: v.pipe(v.string(), v.startsWith(PAGARME_SECRET_PREFIX)) }),
    JSON.parse(plaintext),
  );

  if (!parsed.success) throw new Error("Malformed Pagar.me credentials");

  return parsed.output;
}

/**
 * The outbound transport. Basic auth with the secret key as the username and an
 * empty password, which is what the v5 OpenAPI declares (`http` / `basic`).
 */
export async function pagarMeRequest<T>(
  credentials: PagarMeCredentials,
  path: string,
  init: Omit<RequestInit, "headers"> = {},
): Promise<T> {
  const authorization = Buffer.from(`${credentials.secretKey}:`, "utf8").toString("base64");

  const response = await fetch(`${PAGARME_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${authorization}`,
    },
  });

  if (!response.ok) {
    // The body is Pagar.me's error object, but it can echo request fields; only
    // the status travels, never the response body, so a credential or a card
    // fragment cannot reach a log.
    throw new Error(`Pagar.me request ${path} failed with ${response.status}`);
  }

  // SAFETY: every v5 route answers a 2xx with a JSON object; the caller names
  // the shape it asked for (`T`) and owns validating its fields.
  return (await response.json()) as T;
}
