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

/** What the drain should do with an item once its response is known. */
type ReplayAction = "keep" | "drop" | "backoff" | "stop";

interface ReplayOutcome {
  action: ReplayAction;
  /** Client-facing event to broadcast, if any. */
  notifyType?: string;
  /** Which DrainResult counter this response increments. */
  counted: "ok" | "conflicts" | "sessionExpired" | "errors";
  /** Why the drain halted, for retryable upstream failures. */
  stopReason?: string;
}

/**
 * Classifies a replay response. 412 is a lost race and 401/403 an expired
 * session: both are terminal, so the entry is dropped. 429 and 5xx are
 * retryable, so the drain stops and the entry stays queued.
 */
function classifyReplayResponse(res: Response): ReplayOutcome {
  const { status } = res;

  if (status === 412) {
    return { action: "drop", counted: "conflicts", notifyType: "menuza:conflict" };
  }

  if (status === 401 || status === 403) {
    return { action: "drop", counted: "sessionExpired", notifyType: "menuza:session-expired" };
  }

  if (status === 429 || status >= 500) {
    return { action: "stop", counted: "errors", stopReason: `upstream ${status}` };
  }

  if (!res.ok) return { action: "drop", counted: "errors" };

  return { action: "drop", counted: "ok" };
}

interface SettledItem {
  state: QueuedMutation[];
  /** The backoff ladder is exhausted; the entry was dropped and counts as an error. */
  gaveUp: boolean;
  /** A transport failure wants the drain to halt after persisting. */
  shouldStop: boolean;
}

/** Folds one item's outcome back into the queue state. */
function applyAction(
  state: QueuedMutation[],
  item: QueuedMutation,
  action: ReplayAction,
): SettledItem {
  if (action === "drop") {
    return { state: state.filter((q) => q.id !== item.id), gaveUp: false, shouldStop: false };
  }

  if (action !== "backoff") {
    return { state, gaveUp: false, shouldStop: action === "stop" };
  }

  const next: QueuedMutation = { ...item, attempts: item.attempts + 1 };

  // Give up after exhausting the backoff ladder so we don't leak entries forever.
  if (next.attempts >= BACKOFF_MS.length) {
    return { state: state.filter((q) => q.id !== item.id), gaveUp: true, shouldStop: false };
  }

  next.nextAttemptAt = Date.now() + (BACKOFF_MS[next.attempts] ?? 512_000);

  return {
    state: state.map((q) => (q.id === item.id ? next : q)),
    gaveUp: false,
    shouldStop: true,
  };
}

interface ItemOutcome {
  action: ReplayAction;
  stopReason: string | null;
  counted: "ok" | "conflicts" | "sessionExpired" | "errors" | null;
}

/** Replays one queued mutation and reports how the drain should treat it. */
async function attemptItem(
  item: QueuedMutation,
  fetcher: QueueFetcher,
  notify: (type: string, detail: NotificationDetail) => void,
): Promise<ItemOutcome> {
  const headers: ReplayHeaders = { "content-type": "application/json" };

  if (item.ifMatch) {
    headers["if-match"] = item.ifMatch;
  }

  try {
    const res = await fetcher(item.url, {
      method: item.method,
      headers,
      body: JSON.stringify(item.body),
    });

    const outcome = classifyReplayResponse(res);

    if (outcome.notifyType) {
      notify(outcome.notifyType, { id: item.id, url: item.url, status: res.status });
    }

    return {
      action: outcome.action,
      stopReason: outcome.stopReason ?? null,
      counted: outcome.counted,
    };
  } catch {
    // Transport failure. Keep with backoff.
    return { action: "backoff", stopReason: null, counted: null };
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

    const outcome = await attemptItem(item, fetcher, notify);
    let action: ReplayAction = outcome.action;
    let stopReason: string | null = outcome.stopReason;

    if (outcome.counted) result[outcome.counted]++;

    const settled = applyAction(state, item, action);

    state = settled.state;

    if (settled.gaveUp) result.errors++;

    if (!settled.shouldStop) continue;

    // After a transport failure, stop draining for now; the next `online` event
    // or Background Sync tick will retry. Avoid hammering a flaky network.
    action = "stop";
    stopReason = "transport error";

    // Persist whatever updates we already applied, then exit.
    await persistState(state);
    result.remaining = state.length;
    // eslint-disable-next-line no-console
    console.warn(`[menuza] drain stopped: ${stopReason}; remaining=${state.length}`);

    return result;
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
