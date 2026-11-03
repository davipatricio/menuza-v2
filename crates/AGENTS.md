# crates — AGENTS.md

The two Menuza APIs in Rust: axum 0.8 + tokio over sqlx 0.9, one Cargo workspace.
Same two services and ports as the Bun cutover they replace, so the proxy, the
internal calls and the session cookie keep working. See ADR-0007.

The Bun code in `apps/` and `packages/` is still the running system. It is
deleted in a later step; do not grow it here and do not import from it.

## Layout

- `crates/contract` — DTOs, `utoipa` schemas and the closed error-code catalog. No IO.
- `crates/persistence` — sqlx 0.9, tenant-scoped query helpers, the baseline migration.
- `crates/domain` — argon2, sessions, money as cents. No HTTP, no axum, no sqlx.
- `crates/http` — shared tower layers and extractors, used by both binaries.
- `crates/api-commerce` — axum binary on `:3001`, router only.
- `crates/api-tenant` — axum binary on `:3002`, router + OAuth2 + MCP (`rmcp`).
- `crates/worker` — River consumer over the same pool. No HTTP port.
- `crates/openapi` — schema emit binary → `openapi/{commerce,tenant}.json`.

Each crate carries its own `AGENTS.md` with the rules that only apply to it. A
nested `src/**/AGENTS.md` states what is wrong or misleading one folder up — if
a line reads true at the crate root, it belongs at the crate root.

## MSRV

`rust-toolchain.toml` pins channel 1.95.0 with rustfmt and clippy, edition 2024.
1.95 is River's MSRV; sqlx 0.9 needs 1.94. Do not lower it and do not add a
nightly feature.

## Commands

Cargo lives in `~/.cargo/bin`, which is not on `PATH` in a fresh shell:

```
export PATH="$HOME/.cargo/bin:$PATH"
```

- `cargo check --workspace` — the everyday check. `bacon` (default job `check`) runs it on save.
- `cargo test --workspace` — unit tests. Nothing here needs infrastructure.
- `cargo run -p api-commerce` / `-p api-tenant` / `-p worker` — one process each.
- `bacon commerce` / `bacon tenant` / `bacon worker` — rerun one binary on save.
- `cargo sqlx prepare --workspace` — refresh `crates/persistence/.sqlx` after touching SQL.
- `cargo run -p openapi -- --check` — fail if the committed OpenAPI JSON drifted.
- `cargo fmt --all` before finishing; `cargo clippy --workspace` for the lint pass.

## Hard rules

- **SQL lives only in `crates/persistence`.** Handlers and domain code get typed
  structs; nothing outside persistence holds a `query!` or sees a `PgRow`.
- **No `axum` type in `crates/domain`.** Domain functions are plain Rust; the
  HTTP types stop at the handler boundary.
- **No IO in `crates/contract`.** It is DTOs, schemas and error codes, nothing else.
- **Ports are the contract:** commerce `:3001`, tenant `:3002`. No third service,
  no merge into one binary.
- **Migrations run as a deploy step** (`sqlx migrate run`), never on boot. Both
  binaries must start against an already-migrated database.
- **Versions are pinned exactly.** axum, sqlx, utoipa and riverqueue are all
  pre-1.0, so every dependency uses `=` in the workspace `Cargo.toml`. Never
  float or `cargo update` a major.
- **One HTTP stack.** Layers and extractors are composed in `crates/http` and
  mounted by both binaries. A copied middleware is a bug.
- **Tenant scope is app-layer.** Every tenant-scoped query binds `tenant_id`.
  RLS is not enabled in this cut (ADR-0001); do not add it here.
