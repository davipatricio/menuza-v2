# apps/commerce

- Owns the Bun.serve process for the commerce API.
- The router implementation lives in `@menuza/api-commerce`; this app
  imports it and wires it into `Bun.serve`.
- Loopback-bound in development. Reachable in production only via internal rewrite from `apps/web`.
- Uses `registerShutdown` from `@menuza/orpc-server` for graceful shutdown (flush in-flight requests + Sentry).
- Compiled artifact: `bun run build` → `dist/commerce` (compile flags owned by root AGENTS.md). Images build via `bun run scripts/docker-build.ts commerce`.
- `HOST` env (default `127.0.0.1`) exists for Docker; the image sets `HOST=0.0.0.0`. Dev stays loopback.
- Buyer-session boundary lives at the host layer (`apps/web/src/proxy.ts`); this server does NOT trust
  client-supplied `tenantId`/`Host`/forwarded headers.
- Input validation happens in the oRPC layer (Zod).
- `initSentry({ service: "commerce" })` runs at startup.
- `/livez` returns 200 once the process boots; `/readyz` returns 200 when the DB
  answers (`SELECT 1`), 503 otherwise.
