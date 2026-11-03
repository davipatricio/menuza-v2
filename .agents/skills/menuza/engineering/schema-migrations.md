# Schema migrations

sqlx 0.9 migration runbook. SQL is the source: migrations are append-only files under
`crates/persistence/migrations/`, and the schema the APIs compile against is that tree.
Crate mechanics live in `crates/persistence/AGENTS.md`; this page is the loop and its
failure modes.

## Loop

1. Add a migration file in `crates/persistence/migrations/` (`<timestamp>_<slug>.sql`).
   `0001_baseline.sql` is the baseline and `0002_river_jobs.sql` is River's tables.
   **Never edit an applied file** — its checksum changes and sqlx refuses to run.
2. Change the statements that read the schema in `crates/persistence/src/**`. They use
   `query!`/`query_as!`, so a stale statement fails the build.
3. `bun run db:migrate` (= `cargo sqlx migrate run --source crates/persistence/migrations`)
   against the local Postgres.
4. `cargo sqlx prepare --workspace` (or `bun run db:deploy`) to refresh the committed
   `.sqlx` cache. Without this, CI (`SQLX_OFFLINE=true`) cannot compile the change.
5. `cargo test --workspace` and `cargo clippy --workspace --all-targets -- -D warnings`.
6. Commit the migration and `.sqlx` together.

Then regenerate anything downstream of a shape: `cargo run -p openapi`, and
`bun run api:generate` in `apps/web` when a field the client reads moved.

`packages/db/prisma/contract.prisma` is the historical contract the baseline was derived
from. Read it; do not edit it, and do not add models there.

## Deploy

- `sqlx migrate run` is a deploy step **before** either binary or the worker starts;
  neither migrates on boot.
- The run takes a Postgres advisory lock and sets `lock_timeout`, so a second deploy fails
  fast instead of queueing behind the first.
- Changes are expand/contract: add columns and tables first, backfill, drop in a later
  release. A migration that requires the old code to stop first is wrong.
- River appends its own tables per release (`0002_river_jobs.sql` today); re-check that
  table set on every `riverqueue` upgrade.

## Failure modes

| Symptom                                                 | Cause                                               | Fix                                                            |
| ------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `cargo check` fails on a `query!` with "no cached data" | the statement changed and `.sqlx` was not refreshed | `cargo sqlx prepare --workspace` with the migrated database up |
| sqlx refuses to run a migration (checksum mismatch)     | an applied file was edited                          | restore the file byte-for-byte and add a new migration instead |
| the deploy hangs on the migration lock                  | another deploy holds the advisory lock              | wait it out or kill the stuck session; never remove the lock   |
| compiles locally but not in CI                          | CI has no database                                  | commit the `.sqlx` entry; a missing one is a missing prepare   |

## Data rules

- Money is `Int` cents / `int4` (ADR-0006); the UI converts at the edge
  (`apps/web/src/lib/format.ts`), never the contract.
- Enum-ish columns are `text` with a CHECK over lowercase ASCII slugs; pt-BR labels live
  only in the UI.
- Timestamps are `Timestamp(3)`, UTC-naive in the row and re-attached at the edge.
- Every commerce table carries `tenantId`, and every tenant-scoped statement binds
  `tenant_id` (app-layer, ADR-0001). `Scope::unscoped(reason)` is the only exception.
- A nullable column added for a new UI affordance keeps existing rows valid without a
  backfill; treat `null` as "not offered", not as `0`.
- Identifier case matters: a camelCase column needs double quotes in SQL (`"priceCents"`).
