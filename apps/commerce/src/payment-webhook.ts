/**
 * The provider callback route.
 *
 * Deliberately a plain Bun route and not an oRPC procedure: Pagar.me posts a
 * raw JSON body, while the RPC mount expects oRPC's `{ json }` envelope — and
 * the shared request logger writes the path, which here carries the integration
 * token. So this route owns its own (redacted) logging and is mounted before
 * both API handlers in `server.ts`.
 *
 * The handler is a thin translation layer. Authentication, decoding, the event
 * ledger and the enqueue decision all live in `acceptPaymentWebhook`, which is
 * unit-testable without HTTP.
 */
import type { Queue } from "bullmq";
import { log, newRequestId } from "@menuza/orpc-server";
import { paymentEventJobId, type PaymentJobPayload } from "@menuza/shared/commerce";
import { acceptPaymentWebhook } from "@menuza/api-commerce";

/** `/webhooks/pagarme/<token>` — the token is the whole credential. */
const WEBHOOK_PREFIX = "/webhooks/pagarme/";

export type PaymentWebhookHandler = (req: Request) => Promise<Response>;

function tokenFromPath(pathname: string): string | null {
  if (!pathname.startsWith(WEBHOOK_PREFIX)) return null;

  const token = pathname.slice(WEBHOOK_PREFIX.length);

  if (token === "" || token.includes("/")) return null;

  return token;
}

function answer(status: number, received: boolean): Response {
  return new Response(JSON.stringify({ received }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createPaymentWebhookHandler(
  queue: Queue<PaymentJobPayload>,
): PaymentWebhookHandler {
  return async (req) => {
    const requestId = newRequestId();

    const token = tokenFromPath(new URL(req.url).pathname);

    if (token === null) return answer(404, false);

    const result = await acceptPaymentWebhook({
      token,
      authorization: req.headers.get("authorization"),
      rawBody: await req.text(),
      enqueue: async (payload) => {
        await queue.add("apply", payload, { jobId: paymentEventJobId(payload.gatewayEventId) });
      },
    });

    // The token never reaches the log: it is the credential, and this route is
    // the one place it would otherwise be captured with every delivery.
    log({
      requestId,
      msg: "payment webhook",
      status: result.status,
      received: result.received,
    });

    return answer(result.status, result.received);
  };
}
