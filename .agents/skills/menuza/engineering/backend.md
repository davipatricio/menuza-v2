# Backend

How a request actually flows and where each backend concern lives. Workspace layout: `monorepo.md`; libraries/versions: `stack.md`.

## Topology

```
browser ──same-origin──► apps/web (TanStack Start, :3003)
                            │  src/server.ts           host → mode; storefront host → tenantId
                            │  src/server/proxy-upstream.ts
                            ▼
             /commerce/* ──► crates/api-commerce (:3001) ─┐
             /tenant/*   ──► crates/api-tenant   (:3002) ─┼─► crates/persistence ─► Postgres
             /oauth/*, /.well-known/*, /mcp ──► api-tenant│
                                                           │
             crates/worker ◄── River (same Postgres) ──────┘
```

- One Cargo workspace, six crates (ADR-0007): `contract` (DTOs, `utoipa` schemas, error catalog), `domain` (argon2, sessions, cents), `persistence` (every SQL string), `menuza-http` in `crates/http` (the tower stack and the extractors), the two binaries, `worker` (ADR-0008) and `openapi` (schema emit).
- The two APIs are **loopback-bound in dev** and reachable in production **only via the web app's proxy**. They never trust a client-supplied tenant id or `Host`.
- `/rpc` is retired per service. The wire is REST paths under `/commerce` and `/tenant`, typed from the committed OpenAPI documents.

## Request path

1. `apps/web/src/server.ts` resolves the request host to a mode and, for a storefront host, to a tenant (via the tenant API's internal resolution). It drops the client's `x-menuza-tenant-id`, `x-menuza-mode` and `x-menuza-host` and writes its own.
2. `proxy-upstream.ts` forwards `/commerce/*` → commerce and `/tenant/*` → tenant with the mount prefix stripped; `/oauth/token`, `/oauth/revoke`, `/.well-known/oauth-authorization-server` and `/mcp` pass through to tenant under the same path. Every other path is left to the app; the proxy is not an open relay.
3. `crates/http` layers run outside-in: request id → catch panic → 30 s timeout → 1 MiB body limit → compression → trace → access log. One chain, mounted by both binaries.
4. Extractors prove the caller: `SessionToken`/`CommerceSession` turn a cookie into its SHA-256 digest, `TenantScope` accepts `x-menuza-tenant-id` only from a trusted hop, `InternalToken` compares `x-menuza-internal-token` against `INTERNAL_API_SECRET` in constant time.
5. The handler reads a `contract` DTO, runs the capability check next to the query it protects, and calls `persistence`. Handlers never see a `PgRow`; a tenant-scoped function takes `&TenantId` as its first parameter.
6. The response is the `contract` DTO serialized by axum; a failure is an `ApiErrorBody` from the closed code catalog. `/livez` and `/readyz` are the probes.

## Two APIs, one contract

- **commerce** = buyer storefront plus orders, wallet and payments (`crates/api-commerce`).
- **tenant** = panel, sessions, accounts, profiles, push, internal host resolution, OAuth2 and MCP (`crates/api-tenant`).
- Shapes are Rust DTOs in `crates/contract`, deriving `utoipa::ToSchema`; `cargo run -p openapi` writes `crates/openapi/{commerce,tenant}.json` and `--check` fails on drift (CI runs it).
- orval generates the web client from those two files (`apps/web`, `bun run api:generate`): `operation_id` is the client function name, so renaming one breaks every caller.
- Error codes are one closed catalog in `crates/contract`; a new code is added there, never minted at a call site.
- OAuth2, `/mcp` and `/webhooks/*` are protocol surfaces: mounted by `router()` and deliberately absent from `openapi()`.

## Auth, sessions, tenancy (the load-bearing part)

- Passwords: **argon2id** in `crates/domain`. Sessions are server-side; the row key is the **SHA-256 digest of the bearer token**, so a digest echoed by a client is already the storage key and is never hashed twice.
- Dashboard staff auth uses `menuza_tenant_sid`; commerce buyers use `menuza_commerce_sid`. Management routes are deny-by-default.
- `panel.*` takes `storeSlug`, never a tenant header; unknown slug and non-member are both `NOT_FOUND`. The account surface is **member-level** (spans stores) and must never grow a `storeSlug`.
- Tenant scope is app-layer: every tenant-scoped query binds `tenant_id`, and `Scope::unscoped(reason)` is the only cross-tenant path (host resolution, worker scans). RLS is not enabled in this cut (ADR-0001).
- Capability checks run in the handler, next to the query they protect, against the store's plan. The router stays a routing table; a path-based policy middleware is rejected in review.
- The only intentionally global lookup is storefront `host → tenant` (token-gated, unscoped); `apps/web` never reads the database (ADR-0005).

## Worker and async work

- `crates/worker` is a **River** consumer over the same Postgres: no Redis client, no listening port, no HTTP (ADR-0008).
- Three queues, one module each: `orders_expiry`, `payment_events`, `push_dispatch`. Queue names live in `queue.rs`, never inline in a handler.
- **Jobs must be idempotent** — a retry never duplicates a side effect (Pix expiry, payment application, notification fan-out). Uniqueness is River's `by_args` over `tenant_id` plus the identifying field, not a caller-supplied job id.
- A job is enqueued in the same transaction as the business write; the worker never writes SQL itself, it calls `persistence`.

## Observability

- `tracing` + `tracing-subscriber`: one span per request carrying method, path and status; JSON logs in production, `DEBUG` access log in development. Logs never carry a cookie, an `authorization` header or the database URL.
- `/docs` is Scalar over the generated document and is mounted only when `MENUZA_ENV=development`; production serves no spec route.
- Sentry is web-only (`@sentry/react`/`@sentry/node`); the Rust binaries do not report to it.
- Business audit is a dedicated table, not only logs (`features/stores-and-teams/audit.md`).

## Checks

- `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all --check`, `cargo run -p openapi -- --check`, plus the Bun side — see `checks.md`.
- A matter of SQL means `cargo sqlx prepare --workspace` in the same change; CI builds from the committed `.sqlx` cache with `SQLX_OFFLINE=true`.
