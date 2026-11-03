# crates/contract — AGENTS.md

The only shared crate between `api-commerce` and `api-tenant`. It must stay
IO-free: DTOs, `utoipa` schemas and the error-code catalog, nothing else. No
`async fn`, no `axum`, no `sqlx`, no database, no filesystem, no network.

## The error catalog is a wire contract

The eight codes in `error.rs`, their `SCREAMING_SNAKE_CASE` strings and their
PT-BR messages are copied verbatim from the retired TypeScript backend. A
client already switches on those strings, so adding, renaming or rewording a
code is a frontend-visible change, not a local convenience. `ErrorCode::ALL`
and `tests/error_codes.rs` pin all eight; extend both together.

## HTTP status lives here as a `u16`

`ErrorCode::status` returns a plain `u16` on purpose. If it returned
`http::StatusCode` or an axum type this crate would drag the whole HTTP stack
into the schema layer. `menuza-http` owns the conversion from `ApiErrorBody`
and `status()` to a real response; do not move that here.

## Schemas are generated, not hand-written

Every DTO derives `utoipa::ToSchema`, and the OpenAPI document in
`crates/openapi` is emitted from these types. A new response shape gets a type
here before it gets a route, and a hand-edited `openapi/*.json` is a bug.

Operation ids are camelCase, verb-first and stable (`getStorefront`,
`createProduct`). The generated TanStack Query client names its hooks from
them, so a renamed operation id is a rename in every caller.

## Timestamps are strings

`Health.timestamp` is a `String` in RFC 3339 with milliseconds and a trailing
`Z` — what `Date.toISOString()` produced in the Bun backend. Do not switch it
to a `chrono::DateTime` in the DTO: the JSON shape is the contract, and the
client parses the string itself.

## Tests

`cargo test -p contract` needs no infrastructure. Tests are pure and assert the
serialized JSON, never internal fields.
