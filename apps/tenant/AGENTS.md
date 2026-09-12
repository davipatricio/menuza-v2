# apps/tenant

- Owns the Bun.serve process for the tenant (management) API.
- The router implementation lives in `@menuza/api-tenant`; this app
  imports it and wires it into `Bun.serve`.
- Loopback-bound in development. Reachable in production only via internal rewrite from `apps/web`.
- Uses `registerShutdown` from `@menuza/orpc-server` for graceful shutdown.
- Compiled artifact: `bun run build` → `dist/tenant` (compile flags owned by root AGENTS.md). Images build via `bun run scripts/docker-build.ts tenant`.
- `HOST` env (default `127.0.0.1`) exists for Docker; the image sets `HOST=0.0.0.0`. Dev stays loopback.
- Deny-by-default: only the health endpoint is exposed in this phase.
- Tenant-scoped queries MUST carry explicit `tenantId` filters — middleware does NOT scope Prisma automatically.
- `initSentry({ service: "tenant" })` runs at startup.
