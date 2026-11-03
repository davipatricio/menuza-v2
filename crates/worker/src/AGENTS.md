# crates/worker/src — AGENTS.md

What the crate root does not make obvious is which file owns which piece.

- `main.rs` — config, pool, worker registration, signal handling. The only place
  a `Client` is built; a handler never sees one.
- `queue.rs` — queue names, the five-attempt budget and the one `InsertOpts`
  shape all three kinds share. `orders-expiry` and its insert defaults now come
  from `persistence::jobs`, re-exported here so producer and consumer cannot
  drift. A new kind adds its names here, not inline.
- `orders_expiry.rs` — `orders-expiry`, one delayed job per order code. A
  not-found order completes the job: nothing is left to expire, so a retry would
  burn the budget for no write.
- `payment_events.rs` — `payment-events`, one job per recorded gateway callback.
  The row lock inside `apply_gateway_event` is what makes a replay safe, and a
  not-found event is an error so it retries inside the budget.
- `push_dispatch.rs` — `push-notifications`. Resolves the members who enabled
  the event and still belong to the tenant, then posts to each of their
  subscriptions. It takes a pool for that. A send failure is counted, never
  raised: a retry would re-deliver to the recipients that already got it.
- `push_sender.rs` — the VAPID identity and one push request. It owns the ES256
  JWT, the aes128gcm body and the `reqwest` client, and it is the only place
  that reads `VAPID_*`. Missing or malformed keys mean "disabled", not an error.
- `PaymentEvent` and `PushDispatch` have no producer yet: the webhook receiver
  and the push trigger stay in code the migration did not port.
- The `key` in every log line is `idempotency_key()`: the old BullMQ job id, kept
  because it is what an operator greps for.

Handlers return `WorkOutcome`, so "nothing to do" is `Complete`, a transient
failure is `Err`, and an unrepairable argument is `Discard`. Never panic: a
panicking job consumes an attempt with no record of why.
