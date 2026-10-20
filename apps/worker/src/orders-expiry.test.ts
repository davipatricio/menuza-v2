import { describe, expect, test } from "bun:test";
import {
  dispatchOrderExpiry,
  enqueueOrderExpiry,
  expiryDelay,
  expiryJobId,
  ORDERS_EXPIRY_QUEUE,
  type OrderExpiryJobPayload,
} from "./orders-expiry.ts";

function fakeQueue() {
  const added: Array<{
    name: string;
    data: OrderExpiryJobPayload;
    opts: { delay: number; jobId: string };
  }> = [];

  return {
    added,
    queue: {
      add: async (
        name: string,
        data: OrderExpiryJobPayload,
        opts: { delay: number; jobId: string },
      ) => {
        added.push({ name, data, opts });

        return {};
      },
    },
  };
}

const NOW = Date.parse("2026-03-11T12:00:00.000Z");

describe("orders-expiry", () => {
  test("delay is 0 for a window that already closed", async () => {
    const { added, queue } = fakeQueue();

    await enqueueOrderExpiry(queue, "AB12CD", new Date(NOW - 60_000), "tenant-1");

    expect(added[0]?.opts.delay).toBe(0);
  });

  test("delay is exact for a future window", () => {
    expect(expiryDelay(new Date(NOW + 24 * 60 * 60 * 1000), NOW)).toBe(24 * 60 * 60 * 1000);
  });

  test("job id is stable per code and differs across codes", () => {
    expect(expiryJobId("AB12CD")).toBe(expiryJobId("AB12CD"));
    expect(expiryJobId("AB12CD")).not.toBe(expiryJobId("XY34ZW"));
    expect(ORDERS_EXPIRY_QUEUE).toBe("orders-expiry");
  });

  test("a terminal-state answer from the server is success", async () => {
    const payload: OrderExpiryJobPayload = { tenantId: "tenant-1", orderCode: "AB12CD" };
    const seen: RequestInit[] = [];

    await dispatchOrderExpiry(payload, {
      origin: "http://127.0.0.1:3001",
      secret: "secret",
      fetchFn: async (_url, init) => {
        seen.push(init);

        // Already paid: the server answers 200 with the untouched status.
        return new Response(JSON.stringify({ json: { financialStatus: "paid" } }), { status: 200 });
      },
    });

    expect(seen[0]?.headers).toMatchObject({ "x-menuza-tenant-id": "tenant-1" });
  });

  test("a transport error propagates so BullMQ retries", async () => {
    const payload: OrderExpiryJobPayload = { tenantId: "tenant-1", orderCode: "AB12CD" };

    await expect(
      dispatchOrderExpiry(payload, {
        fetchFn: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    ).rejects.toThrow("ECONNREFUSED");
  });

  test("a non-2xx answer propagates so BullMQ retries", async () => {
    const payload: OrderExpiryJobPayload = { tenantId: "tenant-1", orderCode: "AB12CD" };

    await expect(
      dispatchOrderExpiry(payload, { fetchFn: async () => new Response("nope", { status: 503 }) }),
    ).rejects.toThrow("503");
  });
});
