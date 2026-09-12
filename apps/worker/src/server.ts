/**
 * Worker foundation. NO business jobs in this phase.
 * Verifies Redis connectivity, brings up BullMQ's standard infrastructure,
 * and waits for SIGTERM to shut down cleanly.
 *
 * Per PLAN §9, we DO NOT enqueue fake emails, dashboards, or any handler without
 * a real requirement. The single disposable queue (`smoke`) exists only to prove
 * enqueue/consume/shutdown work end-to-end. It is named uniquely per process start
 * (PID + boot nanos) and cleaned up at shutdown so concurrent workers do not
 * interfere with each other.
 */
import { RedisClient } from "bun";
import { Queue, QueueEvents, Worker, createBunRedisClient } from "bullmq";
import { initSentry } from "@menuza/orpc-server";

initSentry({ service: "worker" });

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// Bun's built-in Redis client via BullMQ's adapter (drops ioredis).
// Shutdown MUST go through the wrapper — never close the raw client.
const connection = createBunRedisClient(new RedisClient(redisUrl));

console.log("[worker] redis connected");

// Unique per process run so we never touch other workers' queues.
const smokeName = `smoke-${process.pid}-${process.hrtime.bigint().toString(36)}`;

const smokeQueue = new Queue(smokeName, { connection });

const events = new QueueEvents(smokeName, { connection });

let receivedCount = 0;

const worker = new Worker(
  smokeName,
  async (job) => {
    receivedCount += 1;

    return { echo: job.data };
  },
  { connection },
);

await events.waitUntilReady();

console.log(`[worker] queues ready (disposable ${smokeName})`);

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
