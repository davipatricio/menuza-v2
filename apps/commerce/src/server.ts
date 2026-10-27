/**
 * Commerce API process. Bun.serve on loopback.
 * Imports the router from `@menuza/api-commerce` and owns the process lifecycle.
 *
 * It also owns the payment webhook producer: the route receives a provider
 * callback, records it, and enqueues the job the worker drains. Redis is not
 * part of the readiness probe — a Redis outage must not take the storefront
 * down; webhooks then answer 500 and the provider retries.
 */
import { RedisClient } from "bun";
import { Queue, createBunRedisClient } from "bullmq";
import {
  buildOpenApiFetch,
  buildRpcFetch,
  initOtel,
  initSentry,
  log,
  newRequestId,
  registerShutdown,
  shutdownOtel,
} from "@menuza/orpc-server";
import { disconnectDb, pingDb } from "@menuza/db";
import { commerceDomainRouter } from "@menuza/api-commerce";
import { PAYMENT_EVENTS_QUEUE, type PaymentJobPayload } from "@menuza/shared/commerce";
import { createPaymentWebhookHandler } from "./payment-webhook.ts";

initSentry({ service: "commerce" });

initOtel({ service: "commerce" });

const port = Number(process.env.COMMERCE_PORT ?? 3001);

// Loopback by default; Docker sets HOST=0.0.0.0 to publish the port.
const hostname = process.env.HOST ?? "127.0.0.1";

const rpcFetch = buildRpcFetch(commerceDomainRouter, { service: "commerce" });

// Same router, RESTful protocol, dedicated prefix. See apps/orpc-server/AGENTS.md.
const openApiFetch = buildOpenApiFetch(commerceDomainRouter, { service: "commerce" });

// Bun's built-in Redis client via BullMQ's adapter, same as the worker.
// Shutdown MUST go through the wrapper — never close the raw client.
const connection = createBunRedisClient(
  new RedisClient(process.env.REDIS_URL ?? "redis://127.0.0.1:6379"),
);

const paymentEventsQueue = new Queue<PaymentJobPayload>(PAYMENT_EVENTS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

const handlePaymentWebhook = createPaymentWebhookHandler(paymentEventsQueue);

const server = Bun.serve({
  port,
  hostname,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/livez") return new Response("ok", { status: 200 });

    if (url.pathname === "/readyz") {
      // Real readiness: the process is only "ready" when the DB answers.
      try {
        await pingDb();

        return new Response("ok", { status: 200 });
      } catch {
        return new Response("unready", { status: 503 });
      }
    }

    // Provider callbacks: raw JSON body, token in the path, own redacted log.
    if (url.pathname.startsWith("/webhooks/")) return handlePaymentWebhook(req);

    if (url.pathname.startsWith("/openapi")) return openApiFetch(req, "/openapi");

    return rpcFetch(req, "/rpc");
  },
});

log({ requestId: newRequestId(), msg: "listening", service: "commerce", port: server.port });

registerShutdown({
  service: "commerce",
  server,
  onShutdown: async () => {
    await paymentEventsQueue.close();
    await shutdownOtel();
    await disconnectDb();
    await connection.quit();
  },
});
