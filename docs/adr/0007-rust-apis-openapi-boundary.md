# Two Rust services behind one OpenAPI contract

The two listening APIs are rewritten as Rust binaries on axum 0.8 + tokio, keeping the
existing deploy units: `crates/api-commerce` on :3001 and `crates/api-tenant` on :3002. sqlx
0.9 with compile-time checked SQL replaces Prisma as the runtime query layer, and the
committed OpenAPI documents stay the contract the TanStack Start app is typed from.

## Context

Two `Bun.serve` processes listen today: commerce on `COMMERCE_PORT` (:3001) and tenant on
`TENANT_PORT` (:3002), both loopback-bound, with the router implementations in
`@menuza/api-commerce` and `@menuza/api-tenant`. They share
`@menuza/orpc-server` for request ids, trace propagation, tenant scope, session cookies and
the internal token.

Prisma 8 is the runtime query layer, and tenant isolation is the application-layer
`withTenant` / `unscoped` pair from ADR-0001. The frontend contract is already OpenAPI, not
TypeScript: `apps/orpc-server/openapi/{commerce,tenant}.json` is committed, generated from
the Valibot contracts' `.meta(openapi(...))` leaves, and drift-pinned by
`apps/orpc-server/test/openapi.test.ts`. The TS types the web app consumes come from the
oRPC contracts in `@menuza/shared`.

That contract is the thing worth keeping. The runtime under it is not: the API and the
frontend are both TypeScript, so nothing at the boundary is checked by a second compiler,
and the process model has no typed SQL.

## Decision

**Two Rust services, same two ports, same deploy units.** `crates/api-commerce` and
`crates/api-tenant` are axum 0.8 + tokio binaries on :3001 and :3002. No third service and
no merge into one binary: the two units deploy and fail independently, and the port pair is
part of the proxy contract the web app already relies on.

**sqlx 0.9, no ORM.** SQL is written by hand and checked at compile time by `query!` /
`query_as!`, with the offline cache committed so CI needs no database. All SQL lives in
`crates/persistence`; handlers receive typed structs and never see a `PgRow`. Type mapping is
fixed: `Int` cents stay `int4` (ADR-0006), timestamps are `chrono::DateTime<Utc>`, Prisma
enums become `sqlx::Type` with the same stored strings, JSON columns are `sqlx::types::Json`.

**Migrations are a deploy step.** `sqlx migrate run` runs once, under a Postgres advisory
lock, before the binaries are started. Neither binary migrates on boot — two services
migrating on a rolling restart is how a schema change half-applies.

**One HTTP stack.** `crates/http` owns the tower layers (request id, catch-panic, timeout,
body limit, compression, trace, access log) and the extractors (`InternalToken`, `Session`,
`TenantScope`), composed once and mounted by both binaries. No middleware is copied per
service.

**OpenAPI stays the frontend contract.** DTOs in `crates/contract` derive `utoipa::ToSchema`
and `ToOpenApi`; a `crates/openapi` binary emits the committed `commerce.json` /
`tenant.json` and fails on drift. orval generates the TanStack Query client for TanStack
Start from those files, behind the existing `createServerFn` reads and one island helper.
The OpenAPI documents, not the Rust types, are what the web app sees.

**OAuth2, MCP and the worker move too.** The five OAuth2 endpoints
(`/.well-known/oauth-authorization-server`, `/oauth/token`, `/oauth/client-check`,
`/oauth/authorize`, `/oauth/revoke`) and stateless `/mcp` move into `crates/api-tenant`,
outside the OpenAPI documents, because they are protocol surfaces (RFC 6749 / MCP) rather
than panel REST. The BullMQ worker moves to River on Postgres.

## Consequences

- axum 0.8, sqlx 0.9, utoipa 6 and riverqueue 0.4 are all pre-1.0, so every version is
  pinned exactly in the workspace `Cargo.toml`. A caret range on a pre-1.0 crate is a
  breaking change waiting for the next `cargo update`.
- No RLS in this cut. ADR-0001's app-layer `tenant_id` on every query stays the boundary;
  RLS (policies plus `SET LOCAL app.tenant_id`) gets its own ADR if it is ever worth the
  cost. sqlx holds the connection for the transaction, so the driver would not change.
- Prisma stops being the runtime query layer, but `packages/db/prisma/contract.prisma`
  stays the source of truth: the sqlx baseline is derived from it, and a schema change lands
  there first.
- Dual-running Bun and Rust against one Postgres is read-only only. The first write port
  (session login or a catalog mutation) ends dual-write for that table.
- Redis loses its last consumer once the worker moves to River. `infra/compose.yaml` and
  `REDIS_URL` stay; removing Redis is a separate decision.
- The wire stays as it is: ports, cookie name `menuza_tenant_sid`, the
  `x-menuza-internal-token` header, error codes, cents, `/livez` and `/readyz`. `/rpc` is
  retired per service only after that service's callers have switched.

## Alternatives rejected

- **`prisma-client-rust`**: archived 2025-03-21, with last real support at Prisma 4.8. The
  repo is on Prisma 8, so it cannot read this schema.
- **diesel or sea-orm**: both put a mapper between the query and the row, which hides the
  N+1 that the panel reads actually have. sqlx `query!` is the compile-time check wanted
  here without the mapper.
- **One merged binary**: breaks the two deploy units and the :3001 / :3002 port contract the
  web proxy and the worker's internal calls already use.
- **Staying on oRPC**: no static typing across the language boundary. A Rust service talking
  oRPC would either re-implement the wire format or lose the compiler check that makes the
  rewrite worth doing; OpenAPI already exists and is already drift-pinned.
