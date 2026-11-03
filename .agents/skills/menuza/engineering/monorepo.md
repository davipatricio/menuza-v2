# Monorepo

Bun workspaces (`apps/*`, `packages/*`) plus one Cargo workspace (`crates/*`) under one repo, one `bun.lock` and one `Cargo.lock`. Internal packages use `workspace:*`, shared external deps sit in the root `workspaces.catalog` (consumed via `catalog:`), and crates depend on each other by path. CI installs with `bun install --frozen-lockfile`.

## Workspaces (what actually exists)

| Path              | Package          | Kind                                                    |
| ----------------- | ---------------- | ------------------------------------------------------- |
| `apps/web`        | `@menuza/web`    | TanStack Start app — marketing + dashboard + storefront |
| `packages/shared` | `@menuza/shared` | browser-safe types (Valibot + legacy oRPC contracts)    |
| `packages/db`     | `@menuza/db`     | historical Prisma contract + migration packages only    |

The offline queue lives in `apps/web/src/offline`, not in a package. The root `AGENTS.md` anti-patterns name `auth-core`, `tenant-context` and `offline` only as packages **not** to create.

## Crates (one Cargo workspace)

| Path                  | Crate          | Kind                                                          |
| --------------------- | -------------- | ------------------------------------------------------------- |
| `crates/contract`     | `contract`     | DTOs, `utoipa` schemas, closed error catalog — no IO          |
| `crates/domain`       | `domain`       | argon2, sessions, cents — no HTTP, no sqlx                    |
| `crates/persistence`  | `persistence`  | every SQL string, tenant scope, `migrations/`                 |
| `crates/http`         | `menuza-http`  | the one tower stack + extractors both binaries mount          |
| `crates/api-commerce` | `api-commerce` | axum binary on `:3001` — storefront, orders, wallet, payments |
| `crates/api-tenant`   | `api-tenant`   | axum binary on `:3002` — panel, sessions, OAuth2, MCP         |
| `crates/worker`       | `worker`       | River consumer, no port                                       |
| `crates/openapi`      | `openapi`      | emits `crates/openapi/{commerce,tenant}.json`                 |

## Dependency direction

```
crates/contract        (leaf: DTOs + schemas + error codes, no IO)
      ▲
crates/domain          ──► contract
      ▲
crates/persistence     ──► contract, domain
      ▲
crates/http            ──► contract, domain        (tower + extractors; no SQL)
      ▲
api-commerce  api-tenant  worker                   (:3001) (:3002) (no port)
      ▲
crates/openapi ──► api-commerce, api-tenant        (emit only)

apps/web  ──►  /commerce/*  /tenant/*  /oauth/*  /mcp   (HTTP, same-origin proxy)
packages/shared  ──►  apps/web only (no server imports, no env, no db)
```

Hard rules (root `AGENTS.md`, crate `AGENTS.md`, workspace-policy test):

- `packages/shared` is browser-safe: **no** server-only imports, env reads, or db access.
- `apps/web` **never** imports a crate, Prisma or a database client, and never reads the database — every read goes over HTTP to `:3001` / `:3002` through the proxy.
- SQL lives only in `crates/persistence`; no `axum` type in `crates/domain`; no IO in `crates/contract`.
- Middleware/auth are **not** separate packages — they live in `menuza-http` and `domain`.
- Ports are the contract: commerce `:3001`, tenant `:3002`. No third service, no merged binary.
- No shared UI package (one frontend consumer, `apps/web`).
- New packages or crates need explicit justification and an entry in `scripts/workspace-policy.test.ts`.

## Where does a change belong?

| Change                                                    | Home                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A request/response shape, error code, or route metadata   | `crates/contract`; then `cargo run -p openapi` and `bun run api:generate`                |
| A handler                                                 | `crates/api-commerce` or `crates/api-tenant`, `domains/<domain>/subdomains/<subdomain>/` |
| Middleware, extractors, probes, layer order               | `crates/http`                                                                            |
| SQL, tenant scope, schema, migration                      | `crates/persistence` (`migrations/`, `0001_baseline.sql` today)                          |
| Async job (Pix expiry, payment application, push fan-out) | `crates/worker` job module + `persistence::jobs` for the enqueue                         |
| UI, route, host routing, cookie forwarding                | `apps/web`                                                                               |
| Process wiring, config, shutdown                          | each crate's `main.rs` + `menuza-http::Config`                                           |

Business logic used by only one binary lives **in that binary**, not in a new crate.

## Scripts and tooling

- Root scripts (root `package.json`): `dev`, `build`, `typecheck`, `test`, `test:integration`, `lint`, `lint:fix`, `fmt`, `fmt:check`, `design:check`, `db:migrate`, `db:deploy`, `infra:up`, `infra:down`.
- `db:migrate` is `cargo sqlx migrate run --source crates/persistence/migrations`; `db:deploy` refreshes the offline cache with `cargo sqlx prepare --workspace -- --all-targets`.
- A Husky pre-commit hook runs `oxfmt` then `oxlint --fix` on staged files only; CI runs the same checks repo-wide.
- Turborepo wraps `build`/`typecheck`/`lint`/`fmt` across `@menuza/*` with a local cache (no remote cache).
- Rust goes through Cargo: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cargo run -p openapi -- --check`.
- `apps/web` builds with Vite to a `dist/` tree served by `dist/server/server.js` on Bun; the Rust binaries build with `cargo build --workspace --release`.

## Checks

- `scripts/workspace-policy.test.ts` enforces catalog hygiene, `workspace:*` protocol, TS 5/6 absence, an `AGENTS.md` per workspace **and per crate**, and that no workspace references a deleted Bun API workspace. Add a package or crate, or move a dep → this test is the guard.
- Keep the tables above true: an empty `packages/<name>` with a `package.json` silently becomes a workspace, and an empty `crates/<name>` becomes a member.
