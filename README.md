# Menuza

Local development foundation for the Menuza product. Not the commerce product.

## Prerequisites

- **Bun 1.4.3** (package manager, runtime, test runner, workspace orchestrator).
- **Podman** on a Debian/Ubuntu host OR **Podman inside WSL2** on Windows.
  - Windows host with WSL2: `podman-compose` 1.3.0+ must be available inside the WSL distribution.
  - Linux host: install `podman` and `podman-compose` natively.
- **Node 20.9+** only for running the Next.js CLI; Bun is the primary runtime.

## Setup

```sh
# 1. Install dependencies (frozen lockfile)
bun install --frozen-lockfile

# 2. Bring up Postgres + Redis (preserves volumes across restarts)
bun run infra:up

# 3. Generate Prisma client and apply migrations
cp .env.example .env
bun run db:generate
bun run db:migrate -- --name init

# 4. Seed local tenants (idempotent)
bun --filter '@menuza/db' prisma db seed

# 5. Start all apps
bun run dev
```

## Local hosts

The web app resolves hosts via `apps/web/src/proxy.ts` using the `WEB_HOST_MAP` env var.
On Windows, add these entries to `C:\Windows\System32\drivers\etc\hosts` (run as Administrator):

```
127.0.0.1   menuza.localhost
127.0.0.1   store.localhost
127.0.0.1   admin.localhost
```

Then visit `http://menuza.localhost:3000` (landing), `http://store.localhost:3000/store` (storefront), and `http://admin.localhost:3000/manage` (management).

## Scripts

- `bun run dev` — concurrent runnable apps (web, commerce, tenant, worker).
- `bun run typecheck` — TS 7 across all workspaces.
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — Prisma generate, Next typegen, Next build.
- `bun run db:generate` / `db:migrate` / `db:deploy` / `db:studio` — Prisma lifecycle.
- `bun run infra:up` / `infra:down` — Postgres + Redis.
- `bunx turbo run <task>` — Turborepo task DAG (local cache).
- CI: GitHub Actions at `.github/workflows/ci.yml` (install, policy, typecheck, test, build).

## Migrations

- `db:migrate` — interactive; creates a new migration under `packages/db/prisma/migrations/`.
- `db:deploy` — applies committed migrations; used in CI and for production-like apply.
- Migrations are NEVER auto-applied at app startup.

## Infrastructure vs. apps

- `infra/compose.yaml` runs Postgres and Redis only. Apps run via `bun run dev`.
- App Dockerfiles, image pipelines, and deployment are explicitly out of scope for this foundation.

## Canary upgrades

When Next publishes a new canary:

1. Update the catalog entry in root `package.json`.
2. Run `bun install`.
3. Re-run `bun run typecheck` and `bun run build`.
4. Update the recorded version in `AGENTS.md` and `PLAN.md` execution log.
5. Commit the lockfile update.

## `apps/orpc-server`

A **library**, not a service. It holds the shared router implementations and logging helpers. It does NOT listen, run as a dev server, or deploy.

## Troubleshooting

- **Podman machine not running (Linux/macOS):** `podman machine init && podman machine start`.
- **WSL Podman not reachable:** verify `wsl -e bash -lc "podman --version"` returns a version.
- **Lockfile drift in CI:** delete `bun.lock` only as a last resort; in normal flow, regenerate locally with `bun install`.
- **Type errors after a Next upgrade:** check `experimental.useTypeScriptCli` is still the supported flag.
