# apps/worker

- Single BullMQ worker process for the foundation. No business handlers exist yet.
- Shutdown drains the worker (`worker.close()`), drains the queue, and disconnects Redis cleanly.
- Jobs must be idempotent: a retry must never produce duplicated side effects.
- Shared Redis keys are namespaced per concern. Tenant data MUST live under `tenant:<tenantId>:*`.
  Operational keys MUST live under `ops:*`. Cross-app invalidation is explicit and audited.
- This phase only contains a disposable `smoke` queue used to prove enqueue/consume/shutdown
  end-to-end. The queue is `obliterate`d in the same process run — there is no leftover state.
- Do NOT add email, dashboard, or business handlers without a real product requirement.
- `initSentry({ service: "worker" })` is called at startup. No-op without `SENTRY_DSN`.
- Redis via Bun's built-in `RedisClient` + BullMQ `createBunRedisClient` (ioredis removed). `REDIS_URL` default `redis://127.0.0.1:6379`.
- Compiled artifact: `bun run build` → `dist/worker` via `bun build --compile --bytecode --format=esm --minify --sourcemap` (no tsdown). Images build via `bun run scripts/docker-build.ts worker`; no HTTP port, no HOST env.
