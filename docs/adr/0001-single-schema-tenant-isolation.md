# Single-schema tenant isolation enforced in the application

All business tables share one Postgres schema with no row-level security; every tenant-scoped
query filters by tenant, checked in the oRPC application layer, because per-schema or RLS
approaches add operational cost without matching the team's single-database VPS posture.

## What the boundary is made of

Three layers, each covering what the one above cannot:

1. **The application guard** (`packages/db/src/tenantIsolation.ts`) — a SQL middleware that
   refuses a read, write or delete on a tenant-scoped model that does not carry an explicit
   `where.tenantId` equality, and refuses a `tenantId` that does not match the active scope.
   It is fail-closed: the query throws rather than widening.
2. **The schema** — every tenant-scoped table carries `tenantId`, a foreign key to `Tenant`
   with `ON DELETE CASCADE`, and an index on `tenantId`. The composed uniques carry the tenant
   too, so a code is unique per store and not across stores.
3. **The database** — the constraints the application cannot express. A foreign key says a
   join row points at a parent; it cannot say the two parents share a tenant, so the join
   tables (`ProductTag`, `CategoryDepartment`) carry their own `tenantId` and a trigger
   rejects a row whose parents disagree.

## Why not row-level security

The stack can do it: Prisma 8's Postgres migration surface exposes `enableRowLevelSecurity`
and `createRlsPolicy`. It was not adopted because of what it costs here, not because it is
unavailable:

- The contract-level `policy_*` authoring is Supabase-extension-only, so on plain Postgres the
  policies would be hand-written SQL that `prisma db verify` cannot check — the policies
  would drift without anything saying so.
- A policy reads the tenant from a session GUC, so every tenant-scoped query would have to run
  inside a transaction that sets it. Most reads today run outside a transaction, and the
  `unscoped()` escape hatch (host resolution, login, the seed) would need a bypass path with
  its own privileges.
- The app connects as the table owner, so every table would need `FORCE ROW LEVEL SECURITY` —
  which then also blocks the migration tool's own data backfills.

What RLS would have bought is one thing: a row filter that no application bug can widen. The
third layer above buys the same thing for the case that actually mattered — a join row
pointing across the tenant boundary — without moving the boundary.

## When to revisit

RLS becomes worth its cost when either of these turns true:

- a second service needs direct database access, so the boundary cannot live only in the
  application layer;
- the tenant boundary moves off a single database.

Until then, the application guard plus the schema constraints are the boundary, and the
integration tests in `packages/db/test/` are what prove they hold.
