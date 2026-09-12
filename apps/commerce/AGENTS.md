# apps/commerce

- Owns the Bun.serve process for the commerce API.
- The router implementation lives in `@menuza/api-commerce`; this app
  imports it and wires it into `Bun.serve`.
- Loopback-bound in development. Reachable in production only via internal rewrite from `apps/web`.
- Uses `registerShutdown` from `@menuza/orpc-server` for graceful shutdown (flush in-flight requests + Sentry).
- Buyer-session boundary lives at the host layer (`apps/web/proxy.ts`); this server does NOT trust
  client-supplied `tenantId`/`Host`/forwarded headers.
- Input validation happens in the oRPC layer (Zod).
- `initSentry({ service: "commerce" })` runs at startup. No-op without `SENTRY_DSN`.
- `/livez` returns 200 once the process boots; `/readyz` returns 200 once the
  process is bound. Tenant-data and DB/Redis readiness are NOT implemented
  yet (deferred).
