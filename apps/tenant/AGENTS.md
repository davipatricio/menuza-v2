# apps/tenant

- Owns the Bun.serve process for the tenant (management) API.
- The router implementation lives in `@menuza/api-tenant`; this app
  imports it and wires it into `Bun.serve`.
- Loopback-bound in development. Reachable in production only via internal rewrite from `apps/web`.
- Uses `registerShutdown` from `@menuza/orpc-server` for graceful shutdown.
- Deny-by-default: only the health endpoint is exposed in this phase.
- Authentication, RBAC, invitations, and audited platform access are explicitly deferred (PLAN.md §13).
- Tenant-scoped queries MUST carry explicit `tenantId` filters — middleware does NOT scope Prisma automatically.
- `initSentry({ service: "tenant" })` runs at startup. No-op without `SENTRY_DSN`.
