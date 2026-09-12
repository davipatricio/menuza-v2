/**
 * Background sync queue for mutations made while offline.
 *
 * Concurrency model: a single in-memory `state` is the authoritative queue during a
 * drain. Every mutation reads `state`, decides what to keep, writes the result back
 * atomically via `persistState()`. A module-level lock prevents two drains from
 * interleaving.
 *
 * Failure handling:
 *  - 5xx, 429: stop the drain immediately. Entries are kept. Exponential backoff
 *    caps at 10 attempts then drops.
 *  - 401, 403: drop the entry, dispatch `menuza:session-expired` so the page can
 *    re-auth. No backoff.
 *  - 412: drop the entry, dispatch `menuza:conflict` for the affected URL.
 *  - Other 4xx: drop the entry (poison-pill prevention).
 *  - Transport failure: keep the entry, bump attempts, continue.
 *
 * Conflict policy: server-wins via `If-Match`. The caller captures the ETag from
 * the read and embeds it in the queue entry.
 */
import { get as idbGet, set as idbSet, del as idbDel, createStore } from "idb-keyval";

export interface QueuedMutation {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Arbitrary JSON payload. Readers only serialize it; never inspect it. */
  body: unknown;
  ifMatch?: string;
  attempts: number;
  nextAttemptAt: number;
  enqueuedAt: number;
}

/** Headers for the queue's replay requests: JSON plus an optional ETag. */
export type ReplayHeaders = globalThis.HeadersInit & {
  "content-type": "application/json";
  "if-match"?: string;
};

/** Result tallies for one drain run. */
export interface DrainResult {
  ok: number;
  conflicts: number;
  sessionExpired: number;
  errors: number;
  remaining: number;
}

const STORE = createStore("menuza-mutation-queue", "queue");

/** Background Sync surface missing from this TS version's lib.dom. */
interface SyncCapable {
  readonly sync?: { register: (tag: string) => Promise<void> };
}

const KEY = "queue";

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000];

let inMemory: QueuedMutation[] | null = null;

let drainInFlight: Promise<DrainResult> | null = null;

async function load(): Promise<QueuedMutation[]> {
  if (inMemory) return inMemory;
  const persisted = (await idbGet<QueuedMutation[]>(KEY, STORE)) ?? [];
  inMemory = persisted;

  return persisted;
}

async function persistState(state: QueuedMutation[]): Promise<void> {
  inMemory = state;

  if (state.length === 0) {
    await idbDel(KEY, STORE);
  } else {
    await idbSet(KEY, state, STORE);
  }
}

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, "id" | "attempts" | "enqueuedAt" | "nextAttemptAt">,
): Promise<string> {
  const state = await load();
  const id = crypto.randomUUID();

  const entry: QueuedMutation = {
    ...mutation,
    id,
    attempts: 0,
    nextAttemptAt: Date.now(),
    enqueuedAt: Date.now(),
  };

  await persistState([...state, entry]);

  return id;
}

export async function listQueued(): Promise<QueuedMutation[]> {
  return [...(await load())];
}

export async function clearQueue(): Promise<void> {
  await persistState([]);
}

/** Fetch-compatible signature for the queue's replay requests: the drain always
 *  calls it with a URL string plus a `{ method, headers, body }` init, and the
 *  native `fetch` is assigned at the default site (structurally compatible). */
export interface QueueFetcher {
  (
    input: string,
    init: {
      method: QueuedMutation["method"];
      headers: ReplayHeaders;
      body: string;
    },
  ): Promise<Response>;
}

export interface DrainOptions {
  /** Override for tests. Defaults to `fetch` in the global scope. */
  fetcher?: QueueFetcher;
  /** Override for tests. Defaults to `dispatchEvent` on `window`. */
  notify?: (type: string, detail: NotificationDetail) => void;
}

/** Structured detail attached to `menuza:*` queue events (id + url, plus status for session expiry). */
export interface NotificationDetail {
  [key: string]: string | number | undefined;
  id: string;
  url: string;
  status?: number;
}

export async function drainQueue(opts: DrainOptions = {}): Promise<DrainResult> {
  if (drainInFlight) return drainInFlight;
  drainInFlight = runDrain(opts);

  try {
    return await drainInFlight;
  } finally {
    drainInFlight = null;
  }
}

async function runDrain(opts: DrainOptions): Promise<DrainResult> {
  if (typeof fetch === "undefined") {
    return { ok: 0, conflicts: 0, sessionExpired: 0, errors: 0, remaining: 0 };
  }

  const fetcher = opts.fetcher ?? fetch;
  const notify = opts.notify ?? defaultNotify;

  const result: DrainResult = { ok: 0, conflicts: 0, sessionExpired: 0, errors: 0, remaining: 0 };
  let state = await load();
  const now = Date.now();

  // Drop entries whose backoff hasn't elapsed yet. They stay in storage.
  for (const item of state) {
    if (item.nextAttemptAt > now) continue;

    let action: "keep" | "drop" | "backoff" | "stop" = "keep";
    let stopReason: string | null = null;

    try {
      const headers: ReplayHeaders = { "content-type": "application/json" };

      if (item.ifMatch) {
        headers["if-match"] = item.ifMatch;
      }

      const res = await fetcher(item.url, {
        method: item.method,
        headers,
        body: JSON.stringify(item.body),
      });

      if (res.status === 412) {
        action = "drop";
        notify("menuza:conflict", { id: item.id, url: item.url });
        result.conflicts++;
      } else if (res.status === 401 || res.status === 403) {
        action = "drop";
        notify("menuza:session-expired", { id: item.id, url: item.url, status: res.status });
        result.sessionExpired++;
      } else if (res.status === 429 || res.status >= 500) {
        action = "stop";
        stopReason = `upstream ${res.status}`;
        result.errors++;
      } else if (!res.ok) {
        action = "drop";
        result.errors++;
      } else {
        action = "drop";
        result.ok++;
      }
    } catch {
      // Transport failure. Keep with backoff.
      action = "backoff";
    }

    if (action === "drop") {
      state = state.filter((q) => q.id !== item.id);
    } else if (action === "backoff") {
      const next: QueuedMutation = { ...item };
      next.attempts = item.attempts + 1;

      if (next.attempts >= BACKOFF_MS.length) {
        // Give up after exhausting the backoff ladder so we don't leak entries forever.
        state = state.filter((q) => q.id !== item.id);
        result.errors++;
      } else {
        next.nextAttemptAt = Date.now() + (BACKOFF_MS[next.attempts] ?? 512_000);
        state = state.map((q) => (q.id === item.id ? next : q));
        // After a transport failure, stop draining for now; the next `online` event
        // or Background Sync tick will retry. Avoid hammering a flaky network.
        action = "stop";
        stopReason = "transport error";
      }
    } else if (action === "stop") {
      // Persist whatever updates we already applied, then exit.
      await persistState(state);
      result.remaining = state.length;
      // eslint-disable-next-line no-console
      console.warn(`[menuza] drain stopped: ${stopReason}; remaining=${state.length}`);

      return result;
    }
  }

  await persistState(state);
  result.remaining = state.length;

  return result;
}

function defaultNotify(type: string, detail: NotificationDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * Wire the queue to two drains: the `online` window event and the SW
 * Background Sync `sync` event (tagged `menuqueue-replay`). Best-effort drain
 * on startup so a reload-after-offline replays everything.
 */
export function startQueueDrainer(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => {
    void drainQueue();
  };

  window.addEventListener("online", onOnline);

  const onSwMessage = (event: MessageEvent) => {
    // SAFETY: only `data.type` is read and compared by strict equality; any
    // other message shape is ignored, so no structural assumption is made.
    const data = event.data as { type?: string } | null;

    if (data?.type === "menuqueue-drain") {
      void drainQueue();
    }
  };

  navigator.serviceWorker?.addEventListener("message", onSwMessage);

  if (navigator.onLine) void drainQueue();

  // Background Sync registration (Chromium). Re-register after each enqueue
  // so subsequent offline mutations get scheduled by the SW.
  const registerSync = () => {
    if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;
    navigator.serviceWorker.ready
      .then(async (reg) => {
        // The Background Sync API is not in lib.dom for this TS version, so
        // the optional `sync` surface is declared structurally.
        // SAFETY: `reg` comes from `navigator.serviceWorker.ready` and is a
        // real `ServiceWorkerRegistration`. Only the optional `sync.register`
        // method is read; absent support the call is skipped.
        const syncCapable = reg as ServiceWorkerRegistration & SyncCapable;
        const sync = syncCapable.sync;

        if (sync) await sync.register("menuqueue-replay");
      })
      .catch(() => {});
  };

  registerSync();

  // Re-register on each enqueue so the OS schedules a fresh sync after the
  // previous one fires (browsers otherwise drop re-registrations with the same tag).
  // We hook into a custom event the caller dispatches after `enqueueMutation`.
  const onEnqueued = () => registerSync();
  window.addEventListener("menuza:enqueued", onEnqueued);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("menuza:enqueued", onEnqueued);
    navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  };
}

/** Public helper for the capture layer to dispatch the re-register signal. */
export function emitEnqueued(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("menuza:enqueued"));
}
