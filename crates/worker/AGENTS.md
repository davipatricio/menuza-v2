# crates/worker — AGENTS.md

The River consumer: one process, one pool, three queues, no listening socket.
`cargo run -p worker` needs `DATABASE_URL` and an already-migrated database.

- **River is the queue** (ADR-0008). Jobs are rows in the same Postgres the APIs
  write, so this crate opens a second pool over one database, never a second
  store. No Redis client here.
- **One module per job kind**, and the module, the job kind and the queue name
  are one name: `orders_expiry`, `payment_events`, `push_dispatch`. Names live in
  `queue.rs`, never inline in a handler.
- **`PaymentEvent` and `PushDispatch` have no producer yet**: the webhook receiver
  and the push trigger stay in code the migration did not port.
- **Idempotency is River's `by_args` uniqueness, not a job id.** River 0.4 takes
  dimensions, not a caller-supplied key, so the old deterministic ids survive as
  `UniqueOpts::with_by_args(true)` over `tenant_id` plus the identifying field.
  Each kind still exposes `idempotency_key()` for logs and tests: it names the
  job, it does not constrain it.
- **Handlers take `&Args`, never `&Job<Args>`.** `JobRow` is `#[non_exhaustive]`,
  so a test outside the crate cannot build a `Job`; the arguments are the input.
- **The worker never writes SQL.** A handler calls `persistence`; `expire` and
  `apply_gateway_event` own their statements, locks and transactions.
- **No port, no `serve`.** `main` builds the client, waits on `SIGINT`/`SIGTERM`
  and closes the pool. Nothing listens and nothing is proxied to it.
- **Migrations stay a deploy step.** River's tables are
  `persistence/migrations/0002_river_jobs.sql`, applied by `sqlx migrate run`
  with the baseline, never on boot; an unreferenced `pub fn` also warns here.
