# Database: local dev, migrations, troubleshooting

Postgres 18 runs in Podman. SQL is the source of truth: the schema is
`crates/persistence/migrations/`, and every statement that reads it lives in
`crates/persistence/src/**` as `query!`/`query_as!`. There is no ORM and no
schema file to keep in sync. `packages/db/prisma/contract.prisma` is the
historical contract the baseline was derived from — read it, never edit it.

## Local instances

| Piece          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Container      | `menuza-postgres` (image `postgres:18-alpine`)                 |
| Host port      | `5433` (container `5432`), bound to `127.0.0.1`                |
| Database       | `menuza`, user `menuza`, password `menuza`                     |
| `DATABASE_URL` | `postgres://menuza:menuza@127.0.0.1:5433/menuza?schema=public` |
| Volume         | named `postgres-data`; `bun run infra:down` keeps it           |

- `bun run infra:up` starts Postgres, Redis (Valkey) and Jaeger via
  `podman-compose`. `bun run infra:down` stops them and keeps volumes.
- The container CLI is **`podman`**. The `docker` binary does not exist in
  non-interactive shells, so `docker ps` silently resolves to nothing useful.
- The WSL Docker Compose plugin is broken; `scripts/infra-up.ts` calls
  `podman-compose` directly.
- Shell access: `podman exec -it menuza-postgres psql -U menuza -d menuza`.
  One-shot: `podman exec menuza-postgres psql -U menuza -d menuza -c "select 1"`.

## The migration loop

1. Add `crates/persistence/migrations/000N_<slug>.sql`. **Never edit an applied
   file** — its checksum changes and sqlx refuses to run.
2. Change the statements in `crates/persistence/src/**`; a stale `query!` fails
   the build.
3. `bun run db:migrate` (`cargo sqlx migrate run --source crates/persistence/migrations`).
4. `bun run db:deploy` (`cargo sqlx prepare --workspace`) to refresh the
   committed `.sqlx` cache. Without it CI (`SQLX_OFFLINE=true`) cannot compile.
5. `cargo test --workspace` and
   `cargo clippy --workspace --all-targets -- -D warnings`.
6. Commit the migration and `.sqlx` together.

Downstream of a shape change: `cargo run -p openapi`, and `bun run api:generate`
in `apps/web` when a field the client reads moved.

`crates/persistence/src/lib.rs` carries a test that asserts the applied
migration list (`baseline_then_river_jobs_then_kits`). Adding a migration means
updating that vector.

## Reading the state

```sh
podman exec menuza-postgres psql -U menuza -d menuza -c '\dt'          # tables
podman exec menuza-postgres psql -U menuza -d menuza \
  -c 'select version, description, success from _sqlx_migrations order by version'
```

`_sqlx_migrations` is sqlx's ledger. A row missing there means sqlx thinks the
migration never ran, even when the tables already exist.

## Failure modes

| Symptom                                                                                         | Cause                                                                                          | Fix                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cargo check` fails on a `query!` with "no cached data"                                         | statement changed, `.sqlx` stale                                                               | `bun run db:deploy` with the migrated database up                               |
| sqlx refuses a migration (checksum mismatch)                                                    | an applied file was edited                                                                     | restore it byte-for-byte, add a new migration instead                           |
| migration fails on a table that already exists                                                  | the database predates `_sqlx_migrations` (a Prisma-era volume, for example)                    | mark the baseline applied, see below                                            |
| deploy hangs on the migration lock                                                              | another deploy holds the advisory lock                                                         | wait, or kill the stuck session; never remove the lock                          |
| compiles locally, not in CI                                                                     | CI has no database                                                                             | commit the `.sqlx` entry                                                        |
| endpoint answers 500 with `ColumnDecode { index: "\"imageUrl\"", source: UnexpectedNullError }` | a nullable column was added but never backfilled, and the Rust DTO reads it as a non-null type | backfill the column and add `NOT NULL` in a new migration; then re-read the row |

### Marking a baseline that already ran

A database created before sqlx managed it has the tables but no ledger row.
Insert the baseline with the checksum sqlx computes (sha384 of the file),
then let `db:migrate` apply the rest:

```sh
sha384sum crates/persistence/migrations/0001_baseline.sql
podman exec menuza-postgres psql -U menuza -d menuza -c "\
insert into _sqlx_migrations (version, description, success, checksum, execution_time) \
values (1, 'baseline', true, '\\x<sha384-hex>', 0)"
```

Then `bun run db:migrate` applies `0002` onward. Verify with the ledger query
above before trusting it.

## Adding a column the Rust DTO reads as required

`sqlx::FromRow` and `query_as!` fail at **runtime**, not at compile time, when a
column comes back `NULL` and the struct field is `String`, `i32` or `bool`. The
statement still compiles, `cargo test` stays green (no database), and the panel
answers 500 with `Erro interno inesperado`. `db_error` swallows the cause unless
it logs it — keep the `tracing::error!(?error, …)` there, it is the only place
that shows the real driver error.

`0003_kits.sql` did everything right except one column: `"imageUrl"` was added
nullable, every other new column was backfilled, and the panel's read of that
kit died with `UnexpectedNullError` while the list page worked. It took a
session to find because the 500 hid the cause.

Do this for **every** new column, in the same migration that adds it:

1. Write down the type the Rust DTO will use. If it is not `Option<T>`, the
   column owes a backfill.
2. Backfill before the constraint: `UPDATE … SET "col" = <sane default> WHERE "col" IS NULL`.
   Empty string for a required text the editor re-validates, `0` for a counter,
   `now()` for a timestamp.
3. Then `ALTER COLUMN … SET NOT NULL`.
4. Only mutate a row in a test after that migration has run.

The reverse rule also holds: a column the DTO reads as `Option<T>` must stay
nullable — adding `NOT NULL` to it turns "not offered" into a crash.

When a single row 500s and the rest of the screen works, the difference is the
row, not the code: pull it up in `psql` and compare every column against the
struct.

## Rules

- Money is `int4` cents (ADR-0006); the UI converts at the edge, never the
  contract.
- Enum-ish columns are `text` with a CHECK over lowercase ASCII slugs; pt-BR
  labels live only in the UI.
- Timestamps are `timestamp(3)`, UTC-naive in the row, re-attached at the edge.
- Every commerce table carries `tenantId`, and every tenant-scoped statement
  binds `tenant_id` (app-layer, ADR-0001). A trigger,
  `menuza_join_tenant_guard()`, refuses a child row whose parent belongs to
  another tenant; a new child table needs a branch there and a trigger.
- Expand/contract: add columns nullable, backfill, add CHECKs and `NOT NULL`
  afterwards, drop in a later release. A migration that requires the old code
  to stop first is wrong.
- A nullable column added for a new UI affordance needs no backfill; `null`
  means "not offered", not `0`.
- Identifier case matters: a camelCase column needs double quotes in SQL
  (`"priceCents"`), and `sqlx::FromRow` needs `#[sqlx(rename = "imageUrl")]`.
