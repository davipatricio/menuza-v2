/**
 * Payment gateway event drain.
 *
 * The commerce API records a callback and enqueues it; this module applies it
 * to the order by calling back into the commerce API. The call goes through the
 * API (never the DB), same as `orders-expiry`: the order state machine and the
 * money helpers live there, and a worker that wrote orders itself would be a
 * second implementation to keep in sync.
 *
 * The job id is deterministic, so a webhook the provider replays collapses onto
 * the same job. `payments.applyGatewayEvent` answers from the event row on the
 * second run, and `markOrderPaid` refuses to credit the cashback twice — so a
 * duplicate delivery can neither double-charge nor double-credit.
 */
import type { PaymentJobPayload } from "@menuza/shared/commerce";

/** Matches `COMMERCE_INTERNAL_URL`'s documented default. */
const DEFAULT_COMMERCE_ORIGIN = "http://127.0.0.1:3001";

export interface DispatchPaymentEventOptions {
  origin?: string;
  secret?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

export async function dispatchPaymentEvent(
  payload: PaymentJobPayload,
  options: DispatchPaymentEventOptions = {},
): Promise<void> {
  const origin = options.origin ?? process.env.COMMERCE_INTERNAL_URL ?? DEFAULT_COMMERCE_ORIGIN;

  const secret = options.secret ?? process.env.INTERNAL_API_SECRET ?? "";

  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const response = await fetchFn(`${origin}/rpc/payments/applyGatewayEvent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-menuza-internal-token": secret,
      "x-menuza-tenant-id": payload.tenantId,
    },
    // The `{ json }` envelope is oRPC's RPC wire format; see `orders-expiry.ts`.
    body: JSON.stringify({ json: { gatewayEventId: payload.gatewayEventId } }),
  });

  // A 2xx is the whole answer: the API already returned "unchanged" for an
  // event it had decided, so there is nothing to inspect and nothing to retry.
  if (!response.ok) {
    throw new Error(
      `payments.applyGatewayEvent failed for ${payload.gatewayEventId}: ${response.status}`,
    );
  }
}
