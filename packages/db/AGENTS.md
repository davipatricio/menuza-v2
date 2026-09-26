# @menuza/db

- Owns the Prisma 8 data contract, migration packages, emitted contract artifacts,
  and the database client lifecycle.
- Contract source: `prisma/contract.prisma`. Emitted artifacts (`contract.json`,
  `contract.d.ts`) land in `prisma/generated/client/` and are gitignored.
  Re-run `bun run db:generate` (=`prisma contract emit`) after every contract edit.
- Migrations are explicit and committed under `migrations/` (Prisma 8 layout:
  `migrations/app/<ts>_<name>` + `migrations/snapshots/<hash>`). No auto-migration
  at app startup. Day-to-day loop: edit contract → `prisma contract emit` →
  `prisma migration plan --name foo` → review the planned package → `prisma db migrate --advance-ref db`.
- The `db` ref anchors `migration plan`'s origin; `db migrate` without
  `--advance-ref` (e.g. CI deploys) must not move it.
- Singleton client lives in `src/client.ts` (`postgres<Contract>(...)`, lazy
  connection). Importing consumers must call `disconnectDb()` on shutdown.
  Use `pingDb()` for readiness probes.
- Query spans: `src/otel-middleware.ts` records one CLIENT span per query/execute, but
  only when a span is already active. Statement text is truncated; bound parameters are
  never recorded.
- Tenant-scoped queries MUST include an explicit `where` on `tenantId`. The runtime
  `tenantIsolationMiddleware()` is fail-closed: querying or mutating a tenant-scoped
  model without `tenantId` (or with a cross-tenant ID under an active tenant scope)
  throws `TenantIsolationError`. Intentionally global lookups (e.g. storefront host
  resolution in the tenant API) must use `unscoped()`.
- AsyncLocalStorage tenant scoping (`withTenant`, `unscoped`, `getActiveTenantId`,
  `isUnscoped`) is owned here and exported from `@menuza/db/scope` (and re-exported on `@menuza/db`).
  Worker and server APIs import it directly. Do NOT create separate packages for tenant scoping.
- `DATABASE_URL` comes from the repo-root `.env` in both places that need it:
  `prisma.config.ts` self-loads it via `process.loadEnvFile`, and runtime callers
  must export it before importing the client (`bun --env-file-if-exists=...` wrappers).
- Runtime: `@prisma/orm-postgres` (ships its own `pg` binding). No driver adapter,
  no `prisma://` Accelerate URL.
- Timestamps: `Timestamp(3)` columns encode/decode as `Temporal.PlainDateTime`
  (UTC-naive to match values written by the old v7 client). Bun ships `Temporal`;
  Node <26.8 would need `temporal-polyfill`.
- No `@default(cuid())` or `@updatedAt` in v8 contracts: seed/scripts set `id`
  (randomUUID) and `updatedAt` explicitly.
- Commerce base models (MEN-225): `Category`, `Product`, `Variation`, `Kit`,
  `KitItem`, `Customer`, `Order`, `Coupon`, `AuditLog` and `MealSubscription`.
  All carry a `tenantId` and a `@@index([tenantId])`, so `TENANT_SCOPED_MODELS`
  — derived from the contract, not hand-listed — picks them up automatically.
  Composed uniques carry `tenantId` too. Money is `Int` cents (ADR-0006);
  `Coupon.value` is cents for a fixed discount and a whole percent for a
  percentage one, disambiguated by `discountType`. Enum-ish columns are
  `@@type("pg/text@1")` with generated CHECKs over stable lowercase ASCII
  slugs; the pt-BR labels live only in the UI. `@@check` expressions must
  quote camelCase identifiers (`"priceCents" >= 0`) — Postgres folds unquoted
  identifiers to lowercase and the migration fails. `AuditLog.action` is free
  text until MEN-74 closes the event catalog. `MealSubscription` is a
  structural stub: cadence and status only, no charging (MEN-150).
- `prisma/seed.ts` is idempotent: it upserts on each model's declared unique, or
  uses a `stableId(scope, key)` SHA-256-derived UUID for the models whose only
  unique is `id`. A second run is a no-op. It seeds commerce fixtures for
  `mawifoods` only; `nova-loja` stays empty so the panel's empty states are
  reachable, and a store created through signup is empty too.

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
- `tsdown` was evaluated and rejected: contract artifacts (`contract.json` imported
  with `with { type: "json" }`) and the runtime's target codecs must not be inlined
  into a bundle.
