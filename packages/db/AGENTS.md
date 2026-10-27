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
- Migration-graph pitfalls (each cost a debugging round; check them before reading
  a surprising plan):
  - A **stale `db` ref** makes a bare `migration plan` fork the graph — it replans
    every edge the ref does not reach (27 operations for a one-column change) and
    warns "The default origin ref 'db' points at … which already has a migration
    leading to … Planning from it forks the migration graph; pass --from to choose
    the origin explicitly." `migrations/app/refs/db.json` must equal the
    `currentContract` that `prisma migration status` prints; compare them first.
  - Pass **`--from <hash>` only**. `--to <hash>` fails with `MIGRATION.REF_NOT_FOUND`
    when the hash is the freshly emitted contract: a contract becomes a graph node
    only once a migration carries it.
  - `prisma db migrate` fails with `MIGRATION.PATH_UNREACHABLE` when no edge joins
    the database's current state to the target — migrate replays existing edges, it
    never invents one. That means the plan was made against the wrong origin.
  - Apply with `prisma db migrate`, then advance the ref (`--advance-ref db`) or the
    next plan forks again. `prisma migration status` then reads "Up to date" and the
    new package lists `db` among its refs.
  - One migration = one real change. `migrations/snapshots/<hash>/` is written with
    the package and is what the next plan diffs against — commit them together.
- Singleton client lives in `src/client.ts` (`postgres<Contract>(...)`, lazy
  connection). Importing consumers must call `disconnectDb()` on shutdown.
  Use `pingDb()` for readiness probes.
- Query spans: `src/otel-middleware.ts` records one CLIENT span per query/execute, but
  only when a span is already active. Statement text is truncated; bound parameters are
  never recorded.
- Tenant-scoped queries MUST include an explicit `where` on `tenantId`. The runtime
  `tenantIsolationMiddleware()` is fail-closed: querying or mutating a tenant-scoped model
  without `tenantId` (or with a cross-tenant ID under an active tenant scope)
  throws `TenantIsolationError`. Intentionally global lookups (e.g. storefront host
  resolution in the tenant API) must use `unscoped()`.
- The guard hooks `beforeCompile`, the pre-lowering hook of the Prisma 8 middleware: it reads
  the query AST and throws to block the statement. `beforeQuery`/`beforeExecute` are gone in
  rc.20; a span is opened by `activityStarted` and closed by `activityEnded`, keyed by the
  activity id.
- AsyncLocalStorage tenant scoping (`withTenant`, `unscoped`, `getActiveTenantId`,
  `isUnscoped`) is owned here and exported from `@menuza/db/scope` (and re-exported on `@menuza/db`).
  Worker and server APIs import it directly. Do NOT create separate packages for tenant scoping.
- The ORM predicate combinators `and` / `or` / `not` are re-exported from
  `@prisma/orm-postgres/orm-client` (`src/index.ts`) so consumers can compose a
  `where` callback without depending on the Prisma package directly — this
  package owns that version pin. `@prisma/db` is not a dependency here.
- `where` has two call shapes and they are **not** composable: `where({ id })`
  takes a filter object, `where((field) => and(...))` takes a predicate. Passing
  both is a type error. Set operators (`in`, `notIn`) and null checks
  (`revokedAt.eq(null)`) only exist on the predicate form, so a query that needs
  them must move its other conditions into the callback too.
- Terminals: `updateAll` returns the updated **rows**; `updateAndCount` returns
  the **number** of affected rows. Use `updateAndCount` when the caller reports a
  count — `updateAll` would make you fetch every row just to measure it.
- RC.17 planner pitfall (still true in rc.20): `update`/`delete` compiled from
  `where({ tenantId, id })` keep only the unique `id` in SQL (the `tenantId` predicate
  is dropped), so the isolation guard rejects them. Use `updateAll`/`deleteAll` (they
  keep the full filter) for tenant-scoped writes by id; `upsert` is safe because its
  conflict target carries `tenantId`. In rc.20 `updateAll`/`deleteAll` also require a
  filter that is not a bare unique key, and `updateAll` hands back the updated rows,
  so `const [row] = await ....updateAll({...})` replaces `update({...})`.
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
  identifiers to lowercase and the migration fails — and since rc.27 they must
  be a `sql` literal (`@@check(expression: sql`"priceCents" >= 0`, name: ...)`);
  a quoted string is refused. `AuditLog.action` is free
  text until MEN-74 closes the event catalog. `MealSubscription` is a
  structural stub: cadence and status only, no charging (MEN-150).
- The money identity of an order is a CHECK, not code:
  `totalCents = subtotalCents - discountCents + shippingCents - walletAppliedCents`.
  `cashbackCents` is earned and never subtracted. The seed computes the same
  identity, so a seeded wallet order satisfies it too.
- A controlled variation carries a quantity and an unlimited one carries none:
  `variation_stock_mode_consistent` says so, and the seed and the panel write
  the two halves that agree with it.
- The join tables (`ProductTag`, `CategoryDepartment`) carry their own
  `tenantId`, so the isolation guard checks them, and a trigger
  (`menuza_join_tenant_guard`) rejects a row whose two parents do not share
  that tenant — a foreign key cannot say that.
- `src/stock.ts` owns the stock a variation carries: `stockLinesFor` expands
  the order lines (a kit takes the variations it names), `reserveVariationStock`
  takes them under a `forUpdate` lock, and `releaseVariationStock` gives them
  back. The schema says which variations are controlled; this says how much
  they hold.
- `prisma/seed.ts` is idempotent: it upserts on each model's declared unique, or
  uses a `stableId(scope, key)` SHA-256-derived UUID for the models whose only
  unique is `id`. A second run is a no-op. It seeds commerce fixtures for
  `mawifoods` only; `nova-loja` stays empty so the panel's empty states are
  reachable, and a store created through signup is empty too. It also seeds a
  three-person team for `mawifoods` (owner/admin/staff) so `settings/team` has
  more than one row; the extra members carry a password hash because
  `verifyPassword` fails closed on null and a team row that cannot log in is a
  fake colleague.

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
- `tsdown` was evaluated and rejected: contract artifacts (`contract.json` imported
  with `with { type: "json" }`) and the runtime's target codecs must not be inlined
  into a bundle.
