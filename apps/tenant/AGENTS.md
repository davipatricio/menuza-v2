# apps/tenant

- Owns the Bun.serve process for the tenant (management) API.
- The router implementation lives in `@menuza/api-tenant`; this app
  imports it and wires it into `Bun.serve`.
- Loopback-bound in development. Reachable in production only via internal rewrite from `apps/web`.
- Uses `registerShutdown` from `@menuza/orpc-server` for graceful shutdown.
- Compiled artifact: `bun run build` → `dist/tenant` (compile flags owned by root AGENTS.md). Images build via `bun run scripts/docker-build.ts tenant`.
- `HOST` env (default `127.0.0.1`) exists for Docker; the image sets `HOST=0.0.0.0`. Dev stays loopback.
- Deny-by-default: the health probe and the push routes (public key, preferences,
  subscriptions) are exposed; every authenticated push route requires a tenant + member
  session.
- Serves the same router over two mounts: `/rpc` (RPC protocol) and `/openapi` (RESTful
  OpenAPI protocol, always `no-store`). Both come from `@menuza/orpc-server`; the OpenAPI
  document is committed at `apps/orpc-server/openapi/tenant.json`.
- Tenant-scoped queries MUST carry explicit `tenantId` filters — middleware does NOT scope Prisma automatically.
- `initSentry({ service: "tenant" })` and `initOtel({ service: "tenant" })` run at startup;
  `shutdownOtel()` flushes pending spans on shutdown.
