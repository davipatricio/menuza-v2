# crates/domain — AGENTS.md

Pure Rust rules shared by both APIs. Nothing here performs IO: no `async fn`, no
`sqlx`, no `axum`, no `tokio`, no database handle, no `std::fs`, no network.

## What belongs here

- Password hashing and verification (`password.rs`).
- Session tokens, cookie serialization and origin checks (`session.rs`).
- Money handling, always integer cents (`money.rs`, later).
- OAuth protocol logic that does not talk to a provider (`oauth.rs`).

Routing, pooling, serialization and handlers stay in `crates/http` and the two
API crates. If a change needs a `PgRow` or a request type, it is in the wrong
crate.

## Sessions: hash once

The session row id is the sha256 of the raw token, and the raw token only ever
lives in the client cookie. A presented token is hashed exactly once, at the
lookup, and the digest is never hashed again: `hash_session_token` of a digest is
a different, unusable key. Never persist, log or return the raw token from a read
path.

## Fixed parameters, accepted parity

The argon2id cost is deliberately pinned (`ARGON2_MEMORY_KIB`,
`ARGON2_TIME_COST`, `ARGON2_PARALLELISM`) to what the Bun backend used. Do not
"improve" the cost: every existing hash must keep verifying, and a different cost
buys nothing until a migration is planned. Parity with the retired Bun backend is
the goal, not a modernisation target.

Cookie attributes are the same compatibility contract. `HttpOnly`, `SameSite=Lax`,
`Path=/`, `Max-Age` and the conditional ` Secure;` segment are what the TS-era
clients and the reverse proxy already expect. Changing the order, a flag or the
spacing around `Secure;` breaks a running client; keep the exact strings, and
`tests/auth.rs` pins them.

## Tests

`cargo test -p domain` needs no infrastructure. Tests are pure: no database, no
network, no async.
