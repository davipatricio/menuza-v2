# Postgres is the job store

The worker's three durable queues move off BullMQ and Redis onto `riverqueue` 0.4.0 over
the existing sqlx Postgres pool. Jobs are enqueued in the same transaction as the business
write, polled rather than pushed, and the worker stays a single binary with no HTTP port.
River's MSRV is why the workspace pins Rust 1.95.

## Context

`apps/worker` runs one Bun process against Redis with three durable BullMQ queues plus a
disposable `smoke` queue:

- `push-notifications` in `src/push-dispatcher.ts` — Web Push fan-out over subscriptions and
  preferences, with a SHA-1-derived job id so a re-enqueue dedupes.
- `orders-expiry` in `src/orders-expiry.ts` — one delayed job per order code, deduped by the
  deterministic id `orders-expiry-<orderCode>`, dispatching `orders.expire` after the payment
  window closes.
- `payment-events` in `src/payment-events.ts` — gateway callbacks already recorded by the
  commerce API, applied once per gateway event id.

All three share the same retry shape — five attempts with exponential backoff from one
second, `removeOnComplete: true`, `removeOnFail: false` — and carry `BullMQOtel` traces, so a
job is a span with a bounded retry budget. Each handler is idempotent by construction: a 2xx
is the whole answer, and a duplicate delivery cannot double-charge or double-credit.

Postgres is already the system of record for every table these jobs touch, and ADR-0007
moves the two listening APIs to Rust. That leaves the worker port needing a job store of its
own, and Redis would otherwise be the last consumer of a service the rest of the stack no
longer uses.

## Decision

**`riverqueue` 0.4.0 on the existing pool.** The worker crate consumes River directly over
sqlx 0.9, with no second connection layer and no Redis client. The version is pinned exactly
in the workspace `Cargo.toml` like every other pre-1.0 crate.

**Enqueue inside the business transaction.** A job insert is an ordinary Postgres write, so
it commits or rolls back with the order, the payment event or the push trigger that created
it. That is transactionally consistent enqueueing without a second store and without an
outbox table. It also requires the persistence executor to stay generic over `PgExecutor`,
which is what lets one function run on `&PgPool` or `&mut Transaction`.

**Polling, no LISTEN/NOTIFY.** River's polling mode is the only mode used. A dedicated
connection parked on `LISTEN` is a connection the API pool cannot use, and it would tie the
worker to session pooling if PgBouncer ever lands.

**One job kind per queue name.** `orders-expiry`, `payment-events` and `push-notifications`
keep their names as River job kinds, and one module per kind owns its handler. The disposable
`smoke` queue is dropped: it existed to prove BullMQ wiring, which is now River's
responsibility, and River has its own migrations and tests.

**Idempotency key per job kind.** The existing keys become River unique jobs unchanged:
`orders-expiry-<orderCode>`, the gateway event id for payment events, and `push-<sha1-16>`
for push. River's unique-job constraint is the dedupe, so the semantics do not shift at the
port.

River 0.4 takes uniqueness dimensions rather than a caller-supplied key, so the
constraint is `UniqueOpts::with_by_args(true)` over `tenant_id` plus the identifying
field, and the key itself survives only as the per-kind `idempotency_key()` in logs and
tests; `push-<sha1-16>` becomes `push-<sha256-16>` because sha1 is not in the workspace.

**No HTTP port.** `crates/worker` is a binary with a River consumer, the Web Push sender and
the same OTel flush plus graceful drain on `SIGINT` / `SIGTERM`. Nothing listens.

**Migrations run through the same runner.** River's tables arrive as append-only files in
`crates/persistence/migrations`, applied by `sqlx migrate run` under the Postgres advisory
lock before the binaries start, exactly as ADR-0007 requires. Neither the worker nor the APIs
migrate on boot.

## Consequences

- The workspace pins Rust 1.95 because `riverqueue` 0.4.0 requires it (`rust-version = "1.95"`
  in `Cargo.toml`, `channel = "1.95.0"` in `rust-toolchain.toml`). If River raises its MSRV,
  the toolchain moves in those two files and in the CI image together; if the new floor is
  unacceptable, the fallback below is taken rather than holding an old River.
- Redis stays in `infra/compose.yaml` and `REDIS_URL` stays documented, but after the cutover
  it has no application consumer. Removing the service is a separate decision.
- Jobs are Postgres rows, so the existing backup and restore cover them, and an old dump also
  rolls the queue back. Replayed work is safe because every kind is idempotent, but a restore
  can re-fire delayed expiries.
- The same advisory-lock migration discipline now protects job tables as well as business
  tables. River appends its own tables per release, so the table count is a dependency to
  re-check on every upgrade; the persistence test that asserts a single baseline migration
  moves when the first River migration lands.
- The worker shares the API's pool configuration (URL, `DATABASE_POOL_MAX`, TLS) but not the
  pool instance. A worker restart cannot starve or reset API connections, at the cost of one
  extra pool's worth of connections against the same server.
- No cross-language worker during the transition. BullMQ and River do not share a queue, so
  the cutover drains the Bun worker or re-enqueues future expiries from the orders table, and
  the Bun worker is deleted in S18 rather than run alongside. Producers switch in the same
  step: the payment webhook and the push enqueue become River inserts inside their existing
  transactions.

## Alternatives rejected

- **Keeping BullMQ**: needs Redis plus a JavaScript runtime for the worker, so the port either
  keeps a Bun process alive forever or adds a Rust Redis client that is wire-compatible with
  BullMQ's keyspace — neither is worth it for three queues, and it keeps a store that has no
  other consumer.
- **`bullmq-rust`**: a packaged stub — a 12-line `bullmq` crate yanked in 2023 whose
  repository now 404s. Nothing to port to.
- **`apalis` 1.0 + `apalis-postgres`**: a real option and the documented fallback if River's
  0.x churn or MSRV blocks, but it is a second abstraction over the same Postgres tables.
  River is chosen first because its transactional enqueue and unique jobs map one-to-one onto
  the semantics the current queues already have.
- **An external broker (SQS, NATS)**: a new service to deploy and secure for a single-node
  installation, and it cannot commit a job in the same transaction as the business write, so
  it reintroduces the dual-write the outbox semantics remove.
