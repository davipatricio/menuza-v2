/* eslint-disable anti-slop/no-runtime-typeof */
/**
 * Sync queue unit tests.
 *
 * These tests verify the drain logic in isolation, with a fake fetcher and
 * fake notification sink. They run under `bun test` (no infra needed) and
 * should also run under `bun run test:integration` (env flag has no effect).
 */
import "fake-indexeddb/auto";
import { describe, expect, test, beforeEach } from "bun:test";
import { drainQueue, enqueueMutation, clearQueue } from "../src/offline/sync-queue.ts";
import type { NotificationDetail } from "../src/offline/sync-queue.ts";

const FAKE_ORIGIN = "https://test.local";

/** Recorded arguments of one fake fetch call. */
interface RecordedCall {
  url: string;
  headers: { [name: string]: string };
  body: string;
}

// A fetcher returning pre-canned `Response`s. The fake takes the general
// fetch input/init so it stays assignable to `QueueFetcher`; only the fields
// `drainQueue` sends are recorded.
type FakeFetcher = (input: URL | RequestInfo, init?: globalThis.RequestInit) => Promise<Response>;

function makeFetcher(responses: Response[]): FakeFetcher & { calls: RecordedCall[] } {
  let i = 0;
  const calls: RecordedCall[] = [];

  const fn: FakeFetcher = async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: readCallHeaders(init?.headers),
      body: readCallBody(init?.body),
    });

    const r = responses[Math.min(i++, responses.length - 1)]!;

    return r;
  };

  return Object.assign(fn, { calls });
}

/** Headers the fake ever receives: the drain always sends `ReplayHeaders`. */
interface DrainHeaders {
  "content-type"?: string;
  "if-match"?: string;
}

/** Flatten a `HeadersInit` into the recorded call's plain header map. The drain
 *  always sends a plain object (see `ReplayHeaders`), so the other two
 *  `HeadersInit` shapes indicate a protocol change and fail loudly here. */
function readCallHeaders(headers: globalThis.HeadersInit | undefined): RecordedCall["headers"] {
  if (headers === undefined) return {};

  if (headers instanceof Headers || Array.isArray(headers)) {
    throw new Error("unexpected HeadersInit shape in queue replay");
  }

  return readDrainHeaders(headers);
}

/** Copy the drain's plain-object headers field by field. The drain always
 *  sends `content-type: application/json`; its absence means a protocol
 *  change and fails loudly here. */
function readDrainHeaders(headers: DrainHeaders): RecordedCall["headers"] {
  const contentType = headers["content-type"];

  if (contentType === undefined) {
    throw new Error("missing content-type in queue replay headers");
  }

  const out: RecordedCall["headers"] = { "content-type": contentType };
  const etag = headers["if-match"];

  if (etag !== undefined) out["if-match"] = etag;

  return out;
}

/** Read the recorded call's body: the drain always sends a JSON string. */
function readCallBody(body: globalThis.BodyInit | null | undefined): string {
  if (isJsonBody(body)) return body;

  return "";
}

function isJsonBody(body: globalThis.BodyInit | null | undefined): body is string {
  return typeof body === "string";
}

function makeResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

const notifications: Array<{ type: string; detail: NotificationDetail }> = [];

const notify = (type: string, detail: NotificationDetail) => notifications.push({ type, detail });

beforeEach(async () => {
  await clearQueue();
  notifications.length = 0;
});

describe("drainQueue", () => {
  test("drops the entry on 2xx and reports ok=1", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/orders/1`, method: "POST", body: { x: 1 } });
    const fetcher = makeFetcher([makeResponse(200)]);
    // The fetcher records calls in the same shape `drainQueue` sends, so it
    // satisfies the `typeof fetch` parameter without a cast.
    const result = await drainQueue({ fetcher, notify });
    expect(result.ok).toBe(1);
    expect(result.remaining).toBe(0);
  });

  test("drops the entry on 412 and fires menuza:conflict", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/orders/1`, method: "POST", body: { x: 1 } });
    const fetcher = makeFetcher([makeResponse(412)]);
    const result = await drainQueue({ fetcher, notify });
    expect(result.conflicts).toBe(1);
    expect(result.remaining).toBe(0);
    expect(notifications.find((n) => n.type === "menuza:conflict")).toBeTruthy();
  });

  test("preserves entries on 500 and stops draining (no replay of subsequent items)", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    await enqueueMutation({ url: `${FAKE_ORIGIN}/b`, method: "POST", body: { b: 2 } });
    const fetcher = makeFetcher([makeResponse(500), makeResponse(200)]);
    const result = await drainQueue({ fetcher, notify });
    expect(result.remaining).toBe(2);
    expect(result.errors).toBe(1);
    // Only the first request should have been issued.
    expect(fetcher.calls.length).toBe(1);
  });

  test("preserves entries on 429 and stops draining", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    const fetcher = makeFetcher([makeResponse(429)]);
    const result = await drainQueue({ fetcher, notify });
    expect(result.remaining).toBe(1);
  });

  test("drops on 401/403 and fires menuza:session-expired", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    const fetcher = makeFetcher([makeResponse(401)]);
    const result = await drainQueue({ fetcher, notify });
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
    await drainQueue({ fetcher, notify });
    const calls = fetcher.calls;
    expect(calls[0]?.headers["if-match"]).toBe("etag-xyz");
  });

  test("drops definitive non-412/4xx errors without stopping the drain", async () => {
    await enqueueMutation({ url: `${FAKE_ORIGIN}/a`, method: "POST", body: { a: 1 } });
    await enqueueMutation({ url: `${FAKE_ORIGIN}/b`, method: "POST", body: { b: 2 } });
    const fetcher = makeFetcher([makeResponse(422), makeResponse(200)]);
    const result = await drainQueue({ fetcher, notify });
    expect(result.errors).toBe(1);
    expect(result.ok).toBe(1);
    expect(result.remaining).toBe(0);
  });
});
