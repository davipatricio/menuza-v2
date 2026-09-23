# Menuza — root AGENTS.md

## Architecture

- Monorepo with Bun workspaces (`apps/*`, `packages/*`).
- One Next.js app (`apps/web`) with three route groups (`apps/web/src/app/`):
  - `(marketing)` (`/`, `/about`, `/pricing`, `/contact`) — marketing site
  - `(storefront)` (`/store/*`, plus `/menu/*`, `/cart`, `/checkout`) — buyer-facing store
  - `(dashboard)` (`/dashboard`, `/dashboard/[storeSlug]`) — store admin on the main
    domain only (see ADR-0005; tenant hosts serve the storefront only)
- Two Bun.serve APIs (`apps/commerce`, `apps/tenant`) are thin shells; the actual
  router implementations live in `@menuza/api-commerce` and `@menuza/api-tenant`
  (layout documented in those workspaces' AGENTS.md).
- Shared contracts in `@menuza/shared` (`/commerce`, `/tenant` entrypoints).
  `apps/orpc-server` holds side-effect-free fetch/RPC plumbing and a tiny logger.
- Browser-side offline support in `@menuza/offline` (IndexedDB persister, mutation queue, Background Sync drain).
- Database in `@menuza/db` (Prisma 8 + `@prisma/orm-postgres`, contract-based).
- One BullMQ worker process (`apps/worker`).
- Local infrastructure: Postgres + Redis + Jaeger via Podman Compose (`infra/compose.yaml`).

## Versions (locked)

- Bun 1.4.3 (workspaces, package manager, runner, test runner).
- TypeScript 7.0.2 only. No TS 5/6 fallback.
- Next `16.4.0-canary.19` with `experimental.useTypeScriptCli: true`.
- React 19.2.8, React DOM 19.2.8.
- Valibot 1.5.0 (catalog; Standard Schema for all oRPC `.input`/`.output`/error
  `data` schemas). No Zod in first-party code — transitive Zod remains via
  `@serwist/*`, `shadcn`, `@modelcontextprotocol/sdk`.
- Tailwind 4.3.3 + `@tailwindcss/postcss` 4.3.3.
- shadcn (Base UI variant on `@base-ui/react` 1.8.0; components in `apps/web/src/components/ui/`).
- oRPC 2.0.0-beta.35 (`@orpc/server`, `@orpc/client`, `@orpc/contract`). v2 wire
  format is incompatible with v1 — server and client deploy together.
- Prisma CLI `8.0.0-rc.14`, `@prisma/orm-postgres` `8.0.0-rc.10` (RC pin; bump CLI and
  ORM package together — wire/marker formats are versioned together).
- BullMQ 6.3.4 over Bun's built-in `RedisClient` (adapter; ioredis removed).
- Turborepo 2.11.0 (task DAG + local cache; no remote cache).
- OpenTelemetry API 1.9.1; trace SDK + OTLP HTTP exporter (2.11.0 / 0.222.0) and
  `bullmq-otel` 2.0.1.
- Sentry Bun 10.73.0 (APIs) + Sentry Next.js 10.73.0 (web); init is a no-op
  without the DSN. LGPD PII scrubbing lives in `@menuza/shared/sentry-privacy`.
- TanStack Query 5.102.8 (provider shell only; no queries yet).
- Serwist 9.5.12 (`@serwist/next`, `@serwist/turbopack`; SW compiled by esbuild and served at `/serwist/sw.js`).
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

## Container images

- One `Containerfile` per service (`apps/{web,commerce,tenant,worker}/Containerfile`). Builds go through `bun run scripts/docker-build.ts <app>`; the context is the pruned monorepo, not the repo root.
- Bun services (commerce, tenant, worker) ship as `bun build --compile` binaries — no tsdown, no node_modules in the runtime layer (`debian:bookworm-slim` + binary + ca-certificates).
- Web ships Next `output: "standalone"` and runs `server.js` on Bun (`oven/bun:1.4.2-slim`; 1.4.3 is a canary pin with no Docker tag).
- Images are hermetic from env: scripts use `--env-file-if-exists`, so builds work without `.env`; runtime config is env-only. Never bake `.env`.
- API images bind `HOST=0.0.0.0` (env baked in image); local dev stays loopback (default `127.0.0.1`).
- CI compiles the binaries in the `build` job. No image pipeline, no deploy.

### Build pipeline: turbo prune + bytecode

- **Builds go through `bun run scripts/docker-build.ts <app>`** — runs `turbo prune <app> --docker` into `.turbo/prune/<app>` (json/ = pruned manifests + lockfile, full/ = source), then builds `apps/<app>/Containerfile` with the pruned dir as context. Context is tiny and install layers are per-service (worker: 84 pkgs). Prune output is gitignored.
- **Bytecode is on** (`--compile --bytecode --format=esm --minify --sourcemap` in the three Bun `build` scripts). ESM bytecode requires `--compile` + `--format=esm`; without `--format=esm` the CJS default fails on top-level `await`. Bytecode is tied to the exact Bun version — images bake `oven/bun:1.4.2`, so bytecode regenerates on every image build; bump the base image tag and rebuild together. Never commit `.jsc`/embedded bytecode as a release artifact outside images.

## Commands

- `bun run dev` — concurrent runnable app processes.
- `bun run typecheck` — TS 7 across workspaces (after `db:generate` and `typegen`).
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — Prisma generate, Next typegen, Next build with type checking.
- `bun run lint` / `bun run fmt:check` — oxlint + oxfmt via turbo.
- `bun run db:generate` (contract emit) / `db:migrate` (migration plan) / `db:deploy` (db migrate) — Prisma 8 lifecycle.
- `bun run infra:up` / `infra:down` — Postgres + Redis + Jaeger.
- `bunx turbo run <task>` — Turborepo task DAG with local cache (e.g. `turbo run build`, `turbo run typecheck`).

## Codebase memory

The repo is indexed in codebase-memory-mcp (project `C-Users-davip-Documents-Projetos-menuza`). Prefer graph tools for structural discovery; fall back to grep/glob for string literals, config values, and non-code files. Full workflow: `docs/agents/codebase-memory.md`.

Session rule: at start or after compaction, confirm project + generation with `index_status`, then pick a tier: Scout (quick lookup, provisional) → Verify (default: traces + snippets for material claims) → Auditor (bounded full verification, disclose limits).

## Security

- No secrets in `.env`/tracked files. Only `.env.example`.
- Tenant resolution lives server-side (`proxy.ts` host→mode map). Client `tenantId`/`Host` are never trusted.
- APIs loopback-bound; production reverse proxy is explicitly out of scope for this foundation.
- `NEXT_PUBLIC_*` variables never carry secrets.
- Management endpoints are deny-by-default.

## Testing

- Bun test runner only. No Vitest or Playwright.
- Unit tests must not need infrastructure. Integration tests are labeled separately.
- `scripts/workspace-policy.test.ts` enforces catalog hygiene, internal dep protocol, TS 5/6 absence, AGENTS.md coverage.

## Working agreements

Bias toward caution over speed. For trivial tasks, use judgment.

### Think before coding

- State assumptions explicitly. If uncertain, ask.
- Multiple interpretations? Present them — don't pick silently.
- Simpler approach exists? Say so. Push back when warranted.
- Something unclear? Stop. Name what's confusing. Ask.

### Surgical changes

- Touch only what the request requires. Don't "improve" adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style even if you'd do it differently.
- Unrelated dead code noticed? Mention it — don't delete it.
- Remove only orphans YOUR changes created (imports/variables/functions now unused).
- Test: every changed line traces directly to the request.

### Goal-driven execution

- Turn tasks into verifiable goals ("fix bug" → "write failing repro, then make it pass").
- Multi-step tasks: brief plan with a verify check per step.
- Loop until verified against the criteria.

## Anti-patterns

- No empty abstraction packages ("for later").
- No factory/config abstractions around a single value.
- No features, flexibility, or configurability beyond what was asked.
- No error handling for impossible scenarios.
- No shared UI package — one frontend consumer.
- No `tsdown`.
- No `ignoreBuildErrors: true`, no silenced compiler checks.

## Tooling state

- **Turborepo**: local cache only; wraps existing scripts. No remote cache.
- **OpenTelemetry**: manual SDK wiring in `@menuza/orpc-server`
  (`initOtel`/`shutdownOtel`) — `TracerProvider` + `BatchSpanProcessor` + OTLP HTTP
  exporter, W3C `traceparent` propagation, `AsyncLocalStorageContextManager`. Child
  spans for RPC requests (continuing an inbound trace), Prisma queries (`packages/db`),
  BullMQ jobs (`bullmq-otel`), and outbound `fetch`. **No-op unless
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set.** No metrics/logs SDK, no browser tracing. A local
  Jaeger collector (OTLP HTTP + UI) ships in `infra/compose.yaml`.
- **Sentry**: `@sentry/bun` initialized in commerce/tenant/worker and
  `@sentry/nextjs` in `apps/web` (client + server + edge). **No-op without the
  DSN** (`SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`). Never commit a DSN. Tracing
  samples 10% by default (`SENTRY_TRACES_SAMPLE_RATE`); set `0` to rely on
  OpenTelemetry only. All SDKs
  share the LGPD lock-down in `@menuza/shared/sentry-privacy` (`dataCollection`
  off + `beforeSend` scrubber). Web source maps upload only when
  `SENTRY_AUTH_TOKEN` is set. **API source maps are not uploaded**: the
  `bun build --compile` binary embeds its map and Sentry cannot symbolicate a
  compiled executable; the `--sourcemap` flag stays for Bun-native traces.
- **TanStack Query**: `QueryProvider` in `apps/web` root layout (persisted via IndexedDB). No queries yet.
- **Serwist (PWA)**: `next.config.ts` wrapped with `withSerwist`; service worker at `/serwist/sw.js`; manifest at `/manifest.webmanifest`; `SerwistProvider` in root layout. Background Sync drain wired; no push.
- **GitHub Actions**: `.github/workflows/ci.yml` runs install → policy → typecheck → test → lint → fmt:check → build. No image pipeline, no deploy.

## Agent skills

### Issue tracker

Issues live in Linear (workspace Menuza, team Menuza) via Linear MCP tools. See `docs/agents/issue-tracker.md`.

When reporting on issues to the user, never cite an identifier alone (`MEN-179`): always pair it with the issue title
(or a short summary of it), e.g. `MEN-179 — Next.js 16.4 canary + RSC + Cache Components`. Applies to lists, tables and
prose. The identifier goes first so it stays copy-pasteable; the title makes it readable without opening Linear.

### Triage labels

Default five canonical roles used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
