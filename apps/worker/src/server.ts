/**
 * Worker foundation.
 * Verifies Redis connectivity, brings up BullMQ's standard infrastructure,
 * processes durable push-notification jobs, and waits for SIGTERM to shut
 * down cleanly.
 *
 * The disposable `smoke` queue exists only to prove enqueue/consume/shutdown
 * work end-to-end. It is named uniquely per process start (PID + boot nanos)
 * and cleaned up at shutdown so concurrent workers do not interfere. The
 * `push-notifications` queue is durable and shared across workers.
 */
import { RedisClient } from "bun";
import { Queue, QueueEvents, Worker, createBunRedisClient } from "bullmq";
import { BullMQOtel } from "bullmq-otel";
import { initOtel, initSentry, shutdownOtel } from "@menuza/orpc-server";
import { disconnectDb } from "@menuza/db";
import { type PushJobPayload, parsePushJobPayload } from "@menuza/shared/push";
import {
  createPushEventPayload,
  dispatchPushEvent,
  PUSH_NOTIFICATIONS_QUEUE,
} from "./push-dispatcher.ts";

initSentry({ service: "worker" });

initOtel({ service: "worker" });

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// Bun's built-in Redis client via BullMQ's adapter (drops ioredis).
// Shutdown MUST go through the wrapper — never close the raw client.
const connection = createBunRedisClient(new RedisClient(redisUrl));

console.log("[worker] redis connected");

// Unique per process run so we never touch other workers' queues.
const smokeName = `smoke-${process.pid}-${process.hrtime.bigint().toString(36)}`;

// Traces only — metrics stay off until a meter reader exists.
const telemetry = new BullMQOtel({ tracerName: "worker" });

const smokeQueue = new Queue(smokeName, { connection, telemetry });

const events = new QueueEvents(smokeName, { connection });

let receivedCount = 0;

const worker = new Worker(
  smokeName,
  async (job) => {
    receivedCount += 1;

    return { echo: job.data };
  },
  { connection, telemetry },
);

const pushQueue = new Queue<PushJobPayload>(PUSH_NOTIFICATIONS_QUEUE, {
  connection,
  telemetry,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

const pushWorker = new Worker<PushJobPayload>(
  PUSH_NOTIFICATIONS_QUEUE,
  async (job) => {
    const jobData = parsePushJobPayload(job.data);

    const payload = jobData.payload ?? createPushEventPayload(jobData.event);

    const result = await dispatchPushEvent({
      tenantId: jobData.tenantId,
      event: jobData.event,
      targetMemberIds: jobData.targetMemberIds,
      payload,
    });

    // Transient send failures must not complete the job: throwing hands it back
    // to BullMQ for the bounded retry/backoff configured on the queue.
    if (result.failedCount > 0) {
      throw new Error(
        `push dispatch transient failures: ${result.failedCount} (sent ${result.sentCount}, expired ${result.expiredCount})`,
      );
    }

    return result;
  },
  { connection, telemetry },
);

await events.waitUntilReady();

console.log(`[worker] queues ready (disposable ${smokeName}, durable ${PUSH_NOTIFICATIONS_QUEUE})`);

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received; draining (${receivedCount} jobs processed)`);

  try {
    await worker.close();
    await smokeQueue.drain(true);
    await events.close();
    await smokeQueue.obliterate({ force: true });
    await pushWorker.close();
    await pushQueue.close();
    await disconnectDb();
    // Flush buffered spans before the OTLP transport goes away.
    await shutdownOtel();
  } catch (err) {
    console.error("[worker] shutdown error:", err);
  } finally {
    await connection.quit();
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Keep the process alive.
await new Promise(() => {});
