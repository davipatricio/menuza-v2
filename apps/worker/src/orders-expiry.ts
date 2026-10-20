/**
 * Delayed, per-order expiry (MEN-93 driver; behaviour is MEN-95's `orders.expire`).
 *
 * One BullMQ delayed job per order code, deduped by the deterministic job id, so a
 * re-enqueued order replaces nothing and never runs twice concurrently. The job is
 * idempotent by construction: `orders.expire` is a no-op for an order that is no
 * longer `awaiting_payment`, and the dispatcher treats any 2xx as done. Only a
 * transport/HTTP failure throws, which hands the job back to BullMQ's bounded retry.
 *
 * The call goes through the commerce API (never the DB): same `COMMERCE_INTERNAL_URL`
 * origin, `/rpc` oRPC mount and `x-menuza-internal-token` header the web proxy uses.
 */

export const ORDERS_EXPIRY_QUEUE = "orders-expiry";

/** Matches `COMMERCE_INTERNAL_URL`'s documented default. */
const DEFAULT_COMMERCE_ORIGIN = "http://127.0.0.1:3001";

export interface OrderExpiryJobPayload {
  tenantId: string;
  orderCode: string;
}

/** The slice of `Queue` this module needs, so a job can be enqueued or faked. */
export interface OrderExpiryQueue {
  add(
    name: string,
    data: OrderExpiryJobPayload,
    opts: { delay: number; jobId: string },
  ): Promise<object>;
}

/** Deterministic id: BullMQ dedupes a second enqueue of the same order onto it. */
export function expiryJobId(orderCode: string): string {
  return `orders-expiry-${orderCode}`;
}

/** Milliseconds to wait; a window that already closed fires immediately. */
export function expiryDelay(expiresAt: Date, now = Date.now()): number {
  return Math.max(0, expiresAt.getTime() - now);
}

export async function enqueueOrderExpiry(
  queue: OrderExpiryQueue,
  orderCode: string,
  expiresAt: Date,
  tenantId: string,
): Promise<void> {
  await queue.add(
    "expire",
    { tenantId, orderCode },
    { delay: expiryDelay(expiresAt), jobId: expiryJobId(orderCode) },
  );
}

export interface DispatchOrderExpiryOptions {
  origin?: string;
  secret?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

export async function dispatchOrderExpiry(
  payload: OrderExpiryJobPayload,
  options: DispatchOrderExpiryOptions = {},
): Promise<void> {
  const origin = options.origin ?? process.env.COMMERCE_INTERNAL_URL ?? DEFAULT_COMMERCE_ORIGIN;
  const secret = options.secret ?? process.env.INTERNAL_API_SECRET ?? "";
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const response = await fetchFn(`${origin}/rpc/orders/expire`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-menuza-internal-token": secret,
      "x-menuza-tenant-id": payload.tenantId,
    },
    // ponytail: the `{ json }` envelope is oRPC's RPC wire format. A typed
    // `@orpc/client` link would own that detail, but it is a new dependency for
    // one call; swap this block for `RPCLink` if the worker ever calls more
    // procedures.
    body: JSON.stringify({ json: { code: payload.orderCode } }),
  });

  // A 2xx is the whole answer. The server already returns "unchanged" for an
  // order that is paid, canceled, refunded or not yet due, so there is nothing
  // to inspect and nothing to retry.
  if (!response.ok) {
    throw new Error(`orders.expire failed for ${payload.orderCode}: ${response.status}`);
  }
}
