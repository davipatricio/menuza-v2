# Menuza — root AGENTS.md

## Architecture

- Monorepo with Bun workspaces (`apps/*`, `packages/*`).
- One Next.js app (`apps/web`) renders three shells via host-aware routing (`apps/web/proxy.ts`):
  - `landing` (`/`, `/about`, `/pricing`, `/contact`) — marketing site
  - `storefront` (`/store/*`, `/menu/*`, `/cart`, `/checkout`) — buyer-facing store
  - `management` (`/manage/*`, `/admin`) — store admin
- Two Bun.serve APIs (`apps/commerce`, `apps/tenant`) are thin shells; the actual
  router implementations live in `@menuza/api-commerce` and `@menuza/api-tenant`,
  organized as `domains/<domain>/subdomains/<subdomain>/<name>.impl.ts` (procedures)
  and `domains/<domain>/router.ts` (per-domain aggregation).
- Shared contracts in `@menuza/shared` (`/commerce`, `/tenant` entrypoints).
  `apps/orpc-server` holds side-effect-free fetch/RPC plumbing and a tiny logger.
- Browser-side offline support in `@menuza/offline` (IndexedDB persister, mutation queue, Background Sync drain).
- Database in `@menuza/db` (Prisma 7 + `@prisma/adapter-pg`).
- One BullMQ worker process (`apps/worker`).
- Local infrastructure: Postgres + Redis via Podman Compose (`infra/compose.yaml`).

## Versions (locked)

- Bun 1.4.3 (workspaces, package manager, runner, test runner).
- TypeScript 7.0.2 only. No TS 5/6 fallback.
- Next `16.4.0-canary.19` with `experimental.useTypeScriptCli: true`.
- React 19.2.8, React DOM 19.2.8.
- Tailwind 4.5.4 + `@tailwindcss/postcss` 4.3.3.
- shadcn 4.21.0 (Base UI variant, package `@base-ui/react` 1.8.0).
- oRPC 1.15.0 (`@orpc/server`, `@orpc/client`, `@orpc/contract`, `@orpc/zod`).
- Prisma 7.10.0 (CLI/client/adapter-pg).
- BullMQ 6.3.4, ioredis 5.4.2.
- Turborepo 2.10.12 (task DAG + local cache; no remote cache).
- OpenTelemetry API 1.9.1 (no SDK/exporter; no-op until added).
- Sentry Bun 10.73.0 (init is no-op without `SENTRY_DSN`).
- TanStack Query 5.102.8 (provider shell only; no queries yet).
- Serwist 9.5.12 (`@serwist/turbopack`; SW compiled by esbuild and served at `/serwist/sw.js`).
- esbuild 0.28.2 (Serwist SW bundler).
- `@tanstack/query-persist-client-core` 5.102.8, `@tanstack/react-query-persist-client` 5.102.8, `idb-keyval` 6.3.0 (offline persister).
- GitHub Actions (replaces GitLab CI per user direction).

## Bun/catalog rules

- Internal packages: `workspace:*`.
- External deps shared by ≥2 workspaces: in root `workspaces.catalog`, consumed via `catalog:`.
- Single-consumer deps stay local.
- Bun lockfile is the only lockfile; CI uses `bun install --frozen-lockfile`.
- Tool/runtime versions are pinned in `package.json` and documented here.

## Local Podman (Windows)

- This machine uses Podman **inside WSL2** (Debian). The Docker Compose plugin in WSL is broken on this image, so `scripts/infra-up.ts` and `scripts/infra-down.ts` invoke `podman-compose` directly.
- Bring infrastructure up: `bun run infra:up`. Down (preserves volumes): `bun run infra:down`.
- If running on a host without WSL, install `podman-compose` standalone and call `podman-compose -f infra/compose.yaml up -d` from the repo root.

## Commands

- `bun run dev` — concurrent runnable app processes.
- `bun run typecheck` — TS 7 across workspaces (after `db:generate` and `typegen`).
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — Prisma generate, Next typegen, Next build with type checking.
- `bun run db:generate` / `db:migrate` / `db:deploy` / `db:studio` — Prisma lifecycle.
- `bun run infra:up` / `infra:down` — Postgres + Redis.
- `bunx turbo run <task>` — Turborepo task DAG with local cache (e.g. `turbo run build`, `turbo run typecheck`).

## Security

- No secrets in `.env`/tracked files. Only `.env.example`.
- Tenant resolution lives server-side (`proxy.ts` + DB lookup). Client `tenantId`/`Host` are never trusted.
- APIs loopback-bound; production reverse proxy is explicitly out of scope for this foundation.
- `NEXT_PUBLIC_*` variables never carry secrets.
- Management endpoints are deny-by-default; auth/RBAC are deferred.

## Testing

- Bun test runner only. No Vitest or Playwright.
- Unit tests must not need infrastructure. Integration tests are labeled separately.
- `scripts/workspace-policy.test.ts` enforces catalog hygiene, internal dep protocol, TS 5/6 absence, AGENTS.md coverage.

## Anti-patterns

- No empty abstraction packages ("for later").
- No factory/config abstractions around a single value.
- No shared UI package — one frontend consumer.
- No `tsdown` until a workspace has a demonstrable bundling requirement.
- No `ignoreBuildErrors: true`, no silenced compiler checks.

## Tooling shell (deferred work, wired as scaffolds only)

- **Turborepo**: local cache only; wraps existing scripts. No remote cache.
- **OpenTelemetry**: `@opentelemetry/api` imported at API/worker boundaries. No exporter. Add `@er/sdk-node` + collector wiring when traces need to leave the process.
- **Sentry**: `@sentry/bun` initialized in commerce/tenant/worker. **No-op without `SENTRY_DSN` env.** Never commit a DSN.
- **TanStack Query**: `QueryClientProvider` in `apps/web` root layout. No queries or `useQuery` calls yet.
- **Serwist (PWA)**: `next.config.ts` wrapped with `withSerwist`; service worker emitted to `/serwist/sw.js`; manifest at `/manifest.webmanifest`; `SerwistProvider` in root layout. Offline sync / background sync / push are not yet wired.
- **GitHub Actions**: `.github/workflows/ci.yml` runs install → policy → typecheck → test → build. No image pipeline, no deploy.

## Agent skills

### Issue tracker

Issues live in Linear (workspace Menuza, team Menuza) via Linear MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
