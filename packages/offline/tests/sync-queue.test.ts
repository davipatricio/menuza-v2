/**
 * Sync queue unit tests.
 *
 * These tests verify the drain logic in isolation, with a fake fetcher and
 * fake notification sink. They run under `bun test` (no infra needed) and
 * should also run under `bun run test:integration` (env flag has no effect).
 */
import "fake-indexeddb/auto";
import { describe, expect, test, beforeEach } from "bun:test";
import { drainQueue, enqueueMutation, clearQueue } from "@menuza/offline/sync-queue";

const FAKE_ORIGIN = "https://test.local";

type RecordedCall = { url: string; headers: Record<string, string>; body: string };

type FakeFetcher = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  calls: RecordedCall[];
};

function makeFetcher(responses: Response[]): FakeFetcher {
  let i = 0;
  const calls: RecordedCall[] = [];

  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    const headers: Record<string, string> = {};

    if (init?.headers) {
      const h = init.headers;

      if (h instanceof Headers) {
        h.forEach((v, k) => (headers[k] = v));
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k] = v;
      } else {
        Object.assign(headers, h);
      }
    }

    calls.push({ url, headers, body: String(init?.body ?? "") });
    const r = responses[Math.min(i++, responses.length - 1)]!;

    return r;
  }) as FakeFetcher;

  fn.calls = calls;

  return fn;
}

function makeResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

const notifications: Array<{ type: string; detail: Record<string, unknown> }> = [];

const notify = (type: string, detail: Record<string, unknown>) =>
  notifications.push({ type, detail });

beforeEach(async () => {
  await clearQueue();
  notifications.length = 0;
});

describe("drainQueue", () => {
  test("drops the entry on 2xx and reports ok=1", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/orders/1`, method: "POST", body: { x: 1 } });
    const fetcher = makeFetcher([makeResponse(200)]);
    const result = await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    expect(result.ok).toBe(1);
    expect(result.remaining).toBe(0);
  });

  test("drops the entry on 412 and fires menuza:conflict", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/orders/1`, method: "POST", body: { x: 1 } });
    const fetcher = makeFetcher([makeResponse(412)]);
    const result = await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    expect(result.conflicts).toBe(1);
    expect(result.remaining).toBe(0);
    expect(notifications.find((n) => n.type === "menuza:conflict")).toBeTruthy();
  });

  test("preserves entries on 500 and stops draining (no replay of subsequent items)", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    await enqueueMutation({ url: `${FAKE_ORIGIN}/b`, method: "POST", body: { b: 2 } });
    const fetcher = makeFetcher([makeResponse(500), makeResponse(200)]);
    const result = await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    expect(result.remaining).toBe(2);
    expect(result.errors).toBe(1);
    // Only the first request should have been issued.
    expect((fetcher as unknown as { calls: RecordedCall[] }).calls.length).toBe(1);
  });

  test("preserves entries on 429 and stops draining", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    const fetcher = makeFetcher([makeResponse(429)]);
    const result = await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    expect(result.remaining).toBe(1);
  });

  test("drops on 401/403 and fires menuza:session-expired", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    const fetcher = makeFetcher([makeResponse(401)]);
    const result = await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    expect(result.sessionExpired).toBe(1);
    expect(result.remaining).toBe(0);
    expect(notifications.find((n) => n.type === "menuza:session-expired")).toBeTruthy();
  });

  test("passes If-Match as a header when present", async () => {
    await enqueueMutation({
      url: `${FAKE_ORIGIN}/orders/1`,
      method: "PUT",
      body: { name: "x" },
      ifMatch: "etag-xyz",
    });
    const fetcher = makeFetcher([makeResponse(200)]);
    await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    const calls = (fetcher as unknown as { calls: RecordedCall[] }).calls;
    expect(calls[0]?.headers["if-match"]).toBe("etag-xyz");
  });

  test("drops definitive non-412/4xx errors without stopping the drain", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    await enqueueMutation({ url: `${FAKE_ORIGIN}/b`, method: "POST", body: { b: 2 } });
    const fetcher = makeFetcher([makeResponse(422), makeResponse(200)]);
    const result = await drainQueue({ fetcher: fetcher as unknown as typeof fetch, notify });
    expect(result.errors).toBe(1);
    expect(result.ok).toBe(1);
    expect(result.remaining).toBe(0);
  });
});
