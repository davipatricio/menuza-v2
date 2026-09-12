# @menuza/offline

- Browser-only offline support package.
- Persists TanStack Query cache to IndexedDB via `idb-keyval` (`./persister`).
- Queues mutations made while `navigator.onLine === false` (`./sw-client.ts` + `./sync-queue.ts`).
- Drain triggers: `online` window event, SW `sync` event tagged `menuqueue-replay`, and page load.
- Queue state is authoritative in memory during a drain; a module-level lock prevents
  two drains from interleaving. `persistState()` is the only writer to IndexedDB.
- `menuza:enqueued` window event is dispatched after each enqueue so the caller
  can re-register the Background Sync tag.

## Failure semantics

- **2xx** — entry dropped.
- **412** — server wins. Entry dropped; `menuza:conflict` fired on `window` with `{ id, url }`.
- **401 / 403** — entry dropped; `menuza:session-expired` fired with `{ id, url, status }`. No backoff.
- **429 / 5xx** — drain **stops immediately**; entries preserved. Exponential backoff on
  next attempt: 1s, 2s, 4s, … 512s, then the entry is dropped.
- **Other 4xx** — entry dropped (poison-pill prevention). No backoff.
- **Transport error** — entry preserved, backoff applied, drain stops for this run.

## Conflict policy

- Server wins via `If-Match`. The caller captures the ETag from the read and passes
  `ifMatch` on the captured mutation. `drainQueue` forwards it as the `if-match` header.
- The listener (`apps/web/src/components/offline-listener.tsx`) refetches the affected query
  and is responsible for surfacing the conflict to the user.

## Threading / reentrancy

- `drainQueue` holds a single in-flight promise; concurrent callers await the same result.
- `enqueueMutation` is safe to call while a drain is running — it appends to the
  in-memory state and writes the whole array atomically.
