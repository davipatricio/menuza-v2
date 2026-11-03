# Menuza

Local development foundation for the Menuza product. Not the commerce product.

## Prerequisites

- **Bun canary channel** — the moving `canary` release; `packageManager`, CI and the Containerfiles all use it. There is no immutable 1.4.4 build to pin.
- **Podman** on a Debian/Ubuntu host OR **Podman inside WSL2** on Windows.
  - Windows host with WSL2: `podman-compose` 1.3.0+ must be available inside the WSL distribution.
  - Linux host: install `podman` and `podman-compose` natively.
- **Rust 1.95.0** from `rust-toolchain.toml` (rustfmt + clippy, edition 2024) — the two APIs and the worker build with Cargo.

## Setup

```sh
# 1. Install dependencies (frozen lockfile)
bun install --frozen-lockfile

# 2. Bring up Postgres + Redis + Jaeger (preserves volumes across restarts)
bun run infra:up

# 3. Configure the environment and apply migrations
cp .env.example .env
bun run db:migrate   # cargo sqlx migrate run

# 4. Start the web app
bun run dev
```

## Local hosts

The web app resolves storefront hosts via `apps/web/src/proxy.ts` using the `WEB_HOST_MAP` env var (only `storefront` entries take effect; any other host is denied with 404 unless it is `WEB_MAIN_DOMAIN` or a development host outside production).
On Windows, add these entries to `C:\Windows\System32\drivers\etc\hosts` (run as Administrator):

```
127.0.0.1   menuza.localhost
127.0.0.1   store.localhost
```

Then visit `http://menuza.localhost:3003` (marketing), `http://menuza.localhost:3003/dashboard` (painel), and `http://store.localhost:3003/store` (storefront).

## Scripts

- `bun run dev` — the web app on Vite (`:3003`); the Rust binaries are separate processes (`cargo run -p api-commerce` / `-p api-tenant` / `-p worker`).
- `bun run typecheck` — `bun check` across all workspaces.
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — typegen then the Vite production build; Rust builds with `cargo build --workspace --release`.
- `bun run db:migrate` / `db:deploy` — the sqlx lifecycle (`cargo sqlx migrate run` / `cargo sqlx prepare`).
- `bun run lint` / `lint:fix` — oxlint via turbo.
- `bun run fmt` / `fmt:check` — oxfmt via turbo.
- `bun run design:check` — dashboard UI design rules (`apps/web/DESIGN.md`).
- `bun run infra:up` / `infra:down` — Postgres + Redis + Jaeger.
- `bunx turbo run <task>` — Turborepo task DAG (local cache).
- CI: GitHub Actions at `.github/workflows/ci.yml` — eleven jobs (`policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`, `rust-fmt`, `rust-clippy`, `rust-test`, `rust-build`, `rust-schema`), actions pinned by commit SHA, Bun from the `canary` channel and Rust from `rustup show`.

## Migrations

- `db:migrate` — applies the append-only SQL under `crates/persistence/migrations/` (`cargo sqlx migrate run --source crates/persistence/migrations`).
- `db:deploy` — refreshes the committed `.sqlx` offline cache (`cargo sqlx prepare --workspace -- --all-targets`); CI builds from it with `SQLX_OFFLINE=true`.
- Migrations are NEVER auto-applied at app startup.

## Infrastructure vs. apps

- `infra/compose.yaml` runs Postgres, Redis and Jaeger. Apps run via `bun run dev` and `cargo run`.
- There is no image pipeline and no deploy: CI compiles the web app and the Rust workspace only.

## Toolchain pins

One source of truth per tool:

- **Bun** — the moving `canary` channel: `packageManager` in root `package.json`, the
  `BUN_VERSION` env in CI, and the `oven/bun:canary` tags in the Containerfiles.
- **TanStack Start / React / TypeScript** — pinned versions in `package.json` (catalog).
- Bumping any of them: change the single pin, `bun install`, then re-run
  `bun run typecheck`, `bun test` and `bun run build`.

## Backend services

Two Rust binaries on one Cargo workspace. `crates/api-commerce` listens on `:3001` (storefront, orders, wallet, payments); `crates/api-tenant` listens on `:3002` (panel, sessions, accounts, OAuth2 and MCP). `crates/worker` is a River consumer over the same Postgres pool and listens on no port. The web app calls them over HTTP; there is no shared Bun server library.

## Troubleshooting

- **Podman machine not running (Linux/macOS):** `podman machine init && podman machine start`.
- **WSL Podman not reachable:** verify `wsl -e bash -lc "podman --version"` returns a version.
- **Lockfile drift in CI:** delete `bun.lock` only as a last resort; in normal flow, regenerate locally with `bun install`.
