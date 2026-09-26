/**
 * Worker-side drain. Same algorithm as `sync-queue.ts` but with:
 *   - `fetch` from the global scope (no `window`).
 *   - `notify` defaulting to `self.clients.postMessage` so the page refetches.
 *
 * The service worker (`apps/web/src/app/sw.ts`) imports this so it can replay
 * queued mutations even when no tabs are open. The page-side `sync-queue.ts`
 * is still the source of truth for in-page drains.
 */
import { get as idbGet, set as idbSet, del as idbDel, createStore } from "idb-keyval";
import type { QueuedMutation, DrainResult, NotificationDetail } from "./sync-queue.ts";
import type { ReplayHeaders } from "./sync-queue.ts";

const STORE = createStore("menuza-mutation-queue", "queue");

const KEY = "queue";

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 512_000];

declare const self: ServiceWorkerGlobalScope | undefined;

async function load(): Promise<QueuedMutation[]> {
  return (await idbGet<QueuedMutation[]>(KEY, STORE)) ?? [];
}

async function persistState(state: QueuedMutation[]): Promise<void> {
  if (state.length === 0) await idbDel(KEY, STORE);
  else await idbSet(KEY, state, STORE);
}

async function notifyClients(type: string, detail: NotificationDetail): Promise<void> {
  if (typeof self === "undefined" || !self.clients) return;
  const clients = await self.clients.matchAll({ includeUncontrolled: true });

  for (const c of clients) {
    c.postMessage({ type, detail });
  }
}

/** What the drain loop should do with an item once its response is known. */
type ReplayAction = "drop" | "backoff" | "stop";

interface ReplayOutcome {
  action: ReplayAction;
  /** Client-facing event to broadcast, if any. */
  notify?: { type: string; detail: { id: string; url: string; status?: number } };
  /** Which DrainResult counter this response increments. */
  counted: "ok" | "conflicts" | "sessionExpired" | "errors";
  /** Why the drain halted, for retryable upstream failures. */
  stopReason?: string;
}

/**
 * Classifies a replay response. 412 is a lost race, 401/403 an expired session:
 * both are terminal. 429 and 5xx are retryable, so the drain stops and leaves
 * the item queued. Any other non-ok status is definitive and is dropped.
 */
function classifyResponse(res: Response): ReplayOutcome {
  const { status } = res;

  if (status === 412) {
    return {
      action: "drop",
      counted: "conflicts",
      notify: { type: "menuza:conflict", detail: { id: "", url: "" } },
    };
  }

  if (status === 401 || status === 403) {
    return {
      action: "drop",
      counted: "sessionExpired",
      notify: { type: "menuza:session-expired", detail: { id: "", url: "" } },
    };
  }

  if (status === 429 || status >= 500) {
    return { action: "stop", counted: "errors", stopReason: `upstream ${status}` };
  }

  if (!res.ok) return { action: "drop", counted: "errors" };

  return { action: "drop", counted: "ok" };
}

interface SettledItem {
  state: QueuedMutation[];
  action: ReplayAction;
  stopReason?: string;
  /** The backoff ladder is exhausted; the entry was dropped and counts as an error. */
  gaveUp: boolean;
}

/** Folds one item's outcome back into the queue state. */
function applyAction(
  state: QueuedMutation[],
  item: QueuedMutation,
  action: ReplayAction,
): SettledItem {
  if (action === "drop") {
    return { state: state.filter((q) => q.id !== item.id), action, gaveUp: false };
  }

  if (action !== "backoff") {
    return { state, action, gaveUp: false };
  }

  const attempts = item.attempts + 1;

  // Give up after exhausting the backoff ladder so we don't leak entries forever.
  if (attempts >= BACKOFF_MS.length) {
    return { state: state.filter((q) => q.id !== item.id), action, gaveUp: true };
  }

  const backoff = BACKOFF_MS[attempts] ?? 512_000;
  const next: QueuedMutation = { ...item, attempts, nextAttemptAt: Date.now() + backoff };

  return {
    state: state.map((q) => (q.id === item.id ? next : q)),
    action: "stop",
    stopReason: "transport error",
    gaveUp: false,
  };
}

interface ItemOutcome {
  action: ReplayAction;
  stopReason: string | null;
  counted: "ok" | "conflicts" | "sessionExpired" | "errors" | null;
}

/** Replays one queued mutation and reports how the drain should treat it. */
async function attemptItem(item: QueuedMutation): Promise<ItemOutcome> {
  const headers: ReplayHeaders = { "content-type": "application/json" };

  if (item.ifMatch) {
    headers["if-match"] = item.ifMatch;
  }

  try {
    const res = await fetch(item.url, {
      method: item.method,
      headers,
      body: JSON.stringify(item.body),
    });

    const outcome = classifyResponse(res);

    if (outcome.notify) {
      await notifyClients(outcome.notify.type, {
        ...outcome.notify.detail,
        id: item.id,
        url: item.url,
        status: res.status,
      });
    }

    return {
      action: outcome.action,
      stopReason: outcome.stopReason ?? null,
      counted: outcome.counted,
    };
  } catch {
    return { action: "backoff", stopReason: null, counted: null };
  }
}

export async function workerDrainQueue(): Promise<DrainResult> {
  const result: DrainResult = { ok: 0, conflicts: 0, sessionExpired: 0, errors: 0, remaining: 0 };
  let state = await load();
  const now = Date.now();

  for (const item of state) {
    if (item.nextAttemptAt > now) continue;

    const outcome = await attemptItem(item);
    let action: ReplayAction = outcome.action;
    let stopReason: string | null = outcome.stopReason;

    if (outcome.counted) result[outcome.counted]++;

    const settled = applyAction(state, item, action);

    state = settled.state;
    action = settled.action;
    stopReason = settled.stopReason ?? stopReason;

    if (settled.gaveUp) result.errors++;

    if (action === "stop") {
      await persistState(state);
      result.remaining = state.length;
      // eslint-disable-next-line no-console
      console.warn(`[menuza/sw] drain stopped: ${stopReason}; remaining=${state.length}`);

      return result;
    }
  }

  await persistState(state);
  result.remaining = state.length;

  return result;
}
