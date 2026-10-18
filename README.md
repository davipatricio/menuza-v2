# Menuza

Local development foundation for the Menuza product. Not the commerce product.

## Prerequisites

- **Bun canary channel** — the moving `canary` release; `packageManager`, CI and the Containerfiles all use it. There is no immutable 1.4.4 build to pin.
- **Podman** on a Debian/Ubuntu host OR **Podman inside WSL2** on Windows.
  - Windows host with WSL2: `podman-compose` 1.3.0+ must be available inside the WSL distribution.
  - Linux host: install `podman` and `podman-compose` natively.
- **Node 20.9+** only for running the Next.js CLI; Bun is the primary runtime.

## Setup

```sh
# 1. Install dependencies (frozen lockfile)
bun install --frozen-lockfile

# 2. Bring up Postgres + Redis + Jaeger (preserves volumes across restarts)
bun run infra:up

# 3. Generate Prisma client and apply migrations
cp .env.example .env
bun run db:generate
bun run db:migrate -- --name init   # plans a migration (prisma migration plan)
bun run db:deploy                   # applies it (prisma db migrate)

# 4. Seed local tenants (idempotent)
bun run --filter '@menuza/db' db:seed

# 5. Start all apps
bun run dev
```

## Local hosts

The web app resolves storefront hosts via `apps/web/src/proxy.ts` using the `WEB_HOST_MAP` env var (only `storefront` entries take effect; any other host is denied with 404 unless it is `WEB_MAIN_DOMAIN` or a development host outside production).
On Windows, add these entries to `C:\Windows\System32\drivers\etc\hosts` (run as Administrator):

```
127.0.0.1   menuza.localhost
127.0.0.1   store.localhost
```

Then visit `http://menuza.localhost:3000` (marketing), `http://menuza.localhost:3000/dashboard` (painel), and `http://store.localhost:3000/store` (storefront).

## Scripts

- `bun run dev` — concurrent runnable apps (web, commerce, tenant, worker).
- `bun run typecheck` — `bun check` across all workspaces.
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — Prisma generate, Next typegen, Next build.
- `bun run db:generate` / `db:migrate` / `db:deploy` / `db:seed` / `db:verify` — Prisma lifecycle.
- `bun run lint` / `lint:fix` — oxlint via turbo.
- `bun run fmt` / `fmt:check` — oxfmt via turbo.
- `bun run design:check` — dashboard UI design rules (`apps/web/DESIGN.md`).
- `bun run infra:up` / `infra:down` — Postgres + Redis + Jaeger.
- `bunx turbo run <task>` — Turborepo task DAG (local cache).
- CI: GitHub Actions at `.github/workflows/ci.yml` — six jobs (`policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`), actions pinned by commit SHA, Bun from the `canary` channel.

## Migrations

- `db:migrate` — plans a new migration (`prisma migration plan`) under `packages/db/migrations/` (`migrations/app/<ts>_<name>` + `migrations/snapshots/<hash>`).
- `db:deploy` — applies committed migrations (`prisma db migrate`); used in CI and for production-like apply.
- Migrations are NEVER auto-applied at app startup.

## Infrastructure vs. apps

- `infra/compose.yaml` runs Postgres, Redis and Jaeger. Apps run via `bun run dev`.
- App Dockerfiles, image pipelines, and deployment are explicitly out of scope for this foundation.

## Toolchain pins

One source of truth per tool:

- **Bun** — the moving `canary` channel: `packageManager` in root `package.json`, the
  `BUN_VERSION` env in CI, and the `oven/bun:canary` tags in the Containerfiles.
- **Next / React / TypeScript** — pinned versions in `package.json` (catalog).
- Bumping any of them: change the single pin, `bun install`, then re-run
  `bun run typecheck`, `bun test` and `bun run build`.

## `apps/orpc-server`

A **library**, not a service. It holds the shared server plumbing — fetch/RPC handlers, auth, tenant middleware, OTel/Sentry, logging. The routers live in `packages/api-commerce` and `packages/api-tenant`. It does NOT listen, run as a dev server, or deploy.

## Troubleshooting

- **Podman machine not running (Linux/macOS):** `podman machine init && podman machine start`.
- **WSL Podman not reachable:** verify `wsl -e bash -lc "podman --version"` returns a version.
- **Lockfile drift in CI:** delete `bun.lock` only as a last resort; in normal flow, regenerate locally with `bun install`.
- **Type errors after a Next upgrade:** check `experimental.useTypeScriptCli` is still the supported flag.
