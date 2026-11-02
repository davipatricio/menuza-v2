# src/offline

Browser-side offline support: query persister, mutation queue, and the service
worker bridge.

## Layout

- `persister.ts` — IndexedDB persister for TanStack Query (opt-in per query via
  `meta: { persist: true }`).
- `sync-queue.ts` — enqueue/read/clear queued mutations.
- `sw-client.ts` — registers `/serwist/sw.js`, requests Background Sync, posts
  drain messages.
- `worker-queue.ts` — the drain used inside the service worker.
- `index.ts` — barrel the app and the listener import.

## Invariants

- Every queued mutation carries the cookie-less payload the API expects; a
  session expiry surfaces as `menuza:session-expired` and clears the queue.
- The service worker never imports React or the DOM renderer.
- The worker is built by `serwistWorker()` in `vite.config.ts` into
  `dist/client/serwist/sw.js`; source of truth is `src/sw.ts`.
- Cache names live in `src/lib/sw-cache-rules.ts` and are shared by both sides.

## Verify

`bunx oxlint apps/web/src/offline apps/web/src/sw.ts && bun test apps/web/tests/sync-queue.test.ts apps/web/tests/sw-cache-rules.test.ts && bun run --filter '@menuza/web' build`
