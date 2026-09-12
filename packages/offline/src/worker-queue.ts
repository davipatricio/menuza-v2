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
import type { QueuedMutation, DrainResult } from "./sync-queue.ts";

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

async function notifyClients(type: string, detail: Record<string, unknown>): Promise<void> {
  if (typeof self === "undefined" || !self.clients) return;
  const clients = await self.clients.matchAll({ includeUncontrolled: true });

  for (const c of clients) {
    c.postMessage({ type, detail });
  }
}

export async function workerDrainQueue(): Promise<DrainResult> {
  const result: DrainResult = { ok: 0, conflicts: 0, sessionExpired: 0, errors: 0, remaining: 0 };
  let state = await load();
  const now = Date.now();

  for (const item of state) {
    if (item.nextAttemptAt > now) continue;

    let action: "drop" | "backoff" | "stop" = "drop";
    let backoff: number | null = null;
    let stopReason: string | null = null;

    try {
      const headers: Record<string, string> = { "content-type": "application/json" };

      if (item.ifMatch) headers["if-match"] = item.ifMatch;

      const res = await fetch(item.url, {
        method: item.method,
        headers,
        body: JSON.stringify(item.body),
      });

      if (res.status === 412) {
        action = "drop";
        await notifyClients("menuza:conflict", { id: item.id, url: item.url });
        result.conflicts++;
      } else if (res.status === 401 || res.status === 403) {
        action = "drop";
        await notifyClients("menuza:session-expired", {
          id: item.id,
          url: item.url,
          status: res.status,
        });
        result.sessionExpired++;
      } else if (res.status === 429 || res.status >= 500) {
        action = "stop";
        stopReason = `upstream ${res.status}`;
        result.errors++;
      } else if (!res.ok) {
        // Definitive non-412, non-401/403, non-5xx error. Drop.
        result.errors++;
      } else {
        result.ok++;
      }
    } catch {
      action = "backoff";
    }

    if (action === "drop") {
      state = state.filter((q) => q.id !== item.id);
    } else if (action === "backoff") {
      const attempts = item.attempts + 1;

      if (attempts >= BACKOFF_MS.length) {
        state = state.filter((q) => q.id !== item.id);
        result.errors++;
      } else {
        backoff = BACKOFF_MS[attempts] ?? 512_000;
        const next: QueuedMutation = { ...item, attempts, nextAttemptAt: Date.now() + backoff };
        state = state.map((q) => (q.id === item.id ? next : q));
        action = "stop";
        stopReason = "transport error";
      }
    }

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
