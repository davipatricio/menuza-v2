# crates/persistence — AGENTS.md

This crate owns every SQL string in the workspace. Handlers, domain functions
and the worker call typed functions here and never see a `PgRow`.

- **Tenant-scoped statements take `&TenantId` as the first parameter** and bind
  it. The id is a text column, not a UUID, and it is never built from user input
  without `TenantId::parse`.
- **`Scope::unscoped` is the only way to run cross-tenant SQL.** It is for two
  call sites: host→tenant resolution (a request arrives before the tenant is
  known) and worker scans that walk every tenant. Each call passes a reason, and
  the reason is what makes the exception auditable in review. A tenant query
  that needs an exception is a design bug, not a reason.
- **The guard is app-layer.** `begin_scoped` requires the tenant id but does not
  set a GUC. RLS is deferred to a later ADR; do not add `SET LOCAL`, a session
  variable, or a policy here before that ADR lands, and never treat the GUC as a
  replacement for the bind parameter.
- **No tenant id in the statement means the query is wrong**, even when it looks
  harmless (a count, a lookup by id). Any id lookup also matches on `tenant_id`.

## Migrations

`MIGRATOR` embeds `migrations/`, with one baseline today.

- Migrations run as a deploy step (`sqlx migrate run`), never on boot. Both
  binaries and the worker start against an already-migrated database.
- The deploy step takes an advisory lock and sets `lock_timeout`, so a second
  deploy fails fast instead of queueing behind the first.
- Changes are expand/contract: add columns and tables first, backfill, drop in a
  later release. A migration that requires the old code to stop first is wrong.
- The set is append-only after the baseline. Editing an applied file changes its
  checksum and sqlx refuses to run.

## sqlx

- `.sqlx` (the offline, prepared-query cache) is committed and refreshed with
  `cargo sqlx prepare --workspace` whenever a query changes. CI builds without a
  database from that cache.
- PgBouncer runs in transaction mode, so connections carry no statement cache:
  configure the pool with `statement_cache_capacity(0)`. A test that passes
  against a direct connection can still fail behind the pooler.
- `cargo test -p persistence` needs no infrastructure. Anything that needs a
  database belongs in a separate, clearly labelled integration test.

## Kits (MEN-82/MEN-83)

`Kit` carries `kind` (`fixed`/`custom_quantities`/`fixed_total`), `pricingMode`
(`fixed`/`sum`), `baseCents` as the charged price or the floor, `percentOff`,
the kit `minItems`/`maxItems`, `maxKitsPerOrder`, `unavailableBehavior` and
`couponStackable`. Children live in `KitGroup`, `KitItem` (now with
`productId`, `groupId`, `minQty`, `maxQty`, `step`, `allowSwap`, nullable
`quantity`), `KitItemVariation` (the swaps the manager allowed) and
`KitDiscountBand`. `CouponKit` mirrors `CouponProduct`.

`kit_update` replaces every child in one transaction; do not build partial
updates. `quantity` is nullable on purpose: a locked kit stores it, a composed
one does not, and `commerce::orders::resolve_line` expands the buyer's submitted
selection instead of the stored rows. Any new query over `KitItem` must handle
that null.
