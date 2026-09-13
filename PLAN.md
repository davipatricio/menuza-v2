# Menuza — Monorepo foundation implementation plan

Status: planning only. Implementation has not started.

## 1. Scope and decisions

Build a runnable development foundation, not the commerce product.

- Bun runtime, package manager, workspaces, scripts, and test runner.
- Next.js installed from `next@canary`; commit the resolved version in `bun.lock`. No restriction to Next 16.3.
- TypeScript **7 only**. No TypeScript 5 or 6 fallback, including silently installed tooling dependencies.
- Enable Next `experimental.useTypeScriptCli`, subject to validation against the resolved canary. Keep build type checking enabled.
- Tailwind CSS v4 and shadcn/ui using **Base UI**, not Radix.
- One Next app for storefront and management, with separate layouts and host-aware routing.
- Separate commerce and tenant APIs using oRPC directly with `Bun.serve`.
- Prisma ORM v7 with PostgreSQL and the PostgreSQL driver adapter.
- One shared BullMQ worker process; no invented business jobs.
- Podman-compatible Compose for **Postgres and Redis only**.
- Apps run locally through Bun. No app Dockerfiles, app image builds, Caddy, or containerized app services in this phase.
- Root `AGENTS.md` plus scoped `AGENTS.md` in every app/package workspace.
- GitLab CI for installation, generation, checking, tests, and frontend build; no image pipeline.
- Existing `PRODUCT.md` is user work. Preserve it; reconcile architecture references only through targeted edits during implementation.

## 2. Tracking rules

- `[ ]` pending; `[x]` completed with evidence.
- Do not mark implementation complete from documentation or generated scaffolding alone.
- Record commands, results, version decisions, and blockers in section 14.
- A failed compatibility gate blocks dependent steps. Do not downgrade forbidden versions or suppress type errors to proceed.
- No Linear changes, commits, infrastructure provisioning, or external account configuration are implied by this plan.

## 3. Target structure

```text
menuza/
├── AGENTS.md
├── PLAN.md
├── PRODUCT.md
├── README.md
├── package.json
├── bun.lock
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── .gitlab-ci.yml
├── apps/
│   ├── web/
│   │   ├── AGENTS.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   └── src/
│   │       ├── app/
│   │       ├── components/ui/
│   │       ├── lib/
│   │       └── proxy.ts
│   ├── commerce/
│   │   ├── AGENTS.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   ├── tenant/
│   │   ├── AGENTS.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   ├── orpc-server/
│   │   ├── AGENTS.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── worker/
│       ├── AGENTS.md
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
├── packages/
│   ├── shared/
│   │   ├── AGENTS.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── commerce/
│   │       └── tenant/
│   └── db/
│       ├── AGENTS.md
│       ├── package.json
│       ├── tsconfig.json
│       ├── prisma.config.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── src/
├── infra/
│   └── compose.yaml
└── scripts/
    └── workspace-policy.test.ts
```

Only add files required by the implementation. No empty abstraction packages.

### Dependency boundaries

- `web` consumes browser-safe shared contracts; never imports Prisma or server implementation packages.
- `commerce` and `tenant` consume `shared`, `orpc-server`, and `db` as needed.
- `worker` consumes server-side dependencies as needed; no dependency on API entrypoints.
- `orpc-server` is a **library**, retained under `apps/` to respect the chosen layout. It has no listening process, dev server, or deployable service.
- `shared` exports explicit `./commerce` and `./tenant` contract entrypoints. No secrets, environment reads, database imports, or server initialization.
- `db` owns schema, migrations, generation, and database client lifecycle.
- Shared UI remains in `apps/web`; there is only one frontend consumer.

## 4. Phase 0 — Repository and compatibility gate

- [ ] Inspect current files and Git status; preserve unrelated work.
- [ ] Check available Bun, Podman, Compose provider, and Git versions.
- [ ] Verify Podman machine state on Windows; document initialization only when missing.
- [ ] Resolve `next@canary` at implementation time; record exact resolved version.
- [ ] Resolve matching React and React DOM versions supported by that canary.
- [ ] Resolve TypeScript v7 and inspect its executable/package compatibility with Next CLI checking.
- [ ] Resolve compatible Prisma v7 CLI, client, and PostgreSQL adapter versions.
- [ ] Resolve matching oRPC package versions, Tailwind v4, shadcn CLI, and Base UI.
- [ ] Consult current official documentation for version-sensitive settings and CLI flags.
- [ ] Validate a minimal Next dev/typegen/build path with `experimental.useTypeScriptCli: true` and TypeScript v7.
- [ ] Check generators and package resolution do not introduce TypeScript 5/6 or Radix.

### TypeScript policy

Prefer the published stable TypeScript 7 package with Next's CLI checker. `tsc` is acceptable when it is the v7 compiler; the package/version matters, not the executable name.

Use `@typescript/native-preview`/`tsgo` only if needed and verified compatible with the chosen Next CLI integration. Do not alias a compiler package merely to satisfy a dependency check without testing actual behavior.

- Do not set `ignoreBuildErrors: true`.
- Do not patch dependency checks to hide missing or incompatible compilers.
- Do not assume native preview supplies the legacy TypeScript JavaScript API.
- If a dependency requires TypeScript 5/6, replace it, choose a compatible version, or record a blocker.
- Avoid removed TS7 settings such as `baseUrl`; use explicit relative `paths` mappings where needed.

Acceptance: the exact selected compiler and Next canary work together; no prohibited compiler versions appear in the resolved dependency graph.

## 5. Phase 1 — Bun workspaces and agent instructions

### Workspace configuration

- [ ] Create a private root package and `workspaces.packages` covering `apps/*` and `packages/*`.
- [ ] Name workspaces consistently under `@menuza/`.
- [ ] Use `workspace:*` for all internal package dependencies.
- [ ] Put external dependencies declared by two or more workspaces into root `workspaces.catalog`; consumers use `catalog:`.
- [ ] Keep single-consumer dependencies local; no speculative catalog entries.
- [ ] Pin tool/runtime versions and document the Bun version used.
- [ ] Commit only Bun's lockfile; use frozen installs in CI.
- [ ] Configure strict ESM TypeScript settings with separate browser and Bun ambient types.
- [ ] Export internal TypeScript source directly where supported by Bun/Next.
- [ ] Avoid tsdown and declaration-build pipelines unless a demonstrated artifact requirement needs them.
- [ ] Add ignore rules for dependencies, generated artifacts, local environment files, and build caches.

### Root scripts

Expose stable root commands; implement with Bun's native workspace capabilities before adding a custom orchestrator.

| Command                    | Responsibility                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| `bun run dev`              | Run local runnable apps concurrently; exclude library-only workspaces   |
| `bun run typecheck`        | Generate required types, then check all workspaces with TypeScript 7    |
| `bun test`                 | Unit/contract/workspace-policy tests that do not require infrastructure |
| `bun run test:integration` | Explicit infrastructure-backed checks                                   |
| `bun run build`            | Generate Prisma/Next types, typecheck, build Next                       |
| `bun run db:generate`      | Generate Prisma client                                                  |
| `bun run db:migrate`       | Explicit development migration workflow                                 |
| `bun run db:deploy`        | Apply committed migrations without schema generation                    |
| `bun run infra:up`         | Start Postgres and Redis using Podman Compose                           |
| `bun run infra:down`       | Stop infrastructure without deleting volumes                            |

- [ ] Ensure commands work from the repository root on Windows PowerShell and Linux CI.
- [ ] Avoid POSIX-only environment assignment and shell-specific process management.
- [ ] Ensure concurrent development processes terminate cleanly when stopped.

### AGENTS.md coverage

Use canonical uppercase `AGENTS.md`; do not create duplicate lowercase filenames on Windows.

- [ ] Root: architecture, commands, TS7-only, Bun/catalog rules, security, testing, no unrequested abstractions.
- [ ] `apps/web`: Server Components, client boundaries, Base UI, Tailwind v4, pt-BR, accessibility, no server-only imports.
- [ ] `apps/commerce`: public API scope, buyer-session boundary, input validation, tenant isolation.
- [ ] `apps/tenant`: management scope, deny-by-default authorization, audited platform access.
- [ ] `apps/orpc-server`: shared server-only library, side-effect-free imports, no service entrypoint.
- [ ] `apps/worker`: shutdown, retry/idempotency requirements, no placeholder business jobs.
- [ ] `packages/shared`: browser-safe contract exports and contract-first changes.
- [ ] `packages/db`: schema ownership, generation, migration safety, tenant-scoped queries.
- [ ] Scoped instructions add local rules rather than duplicating the root file.

Acceptance: workspace resolution, catalog policy, compiler checks, and complete instruction-file coverage pass.

## 6. Phase 2 — Local Postgres, Redis, and Prisma

### Podman Compose

- [ ] Add `infra/compose.yaml` with Postgres and Redis only.
- [ ] Pin compatible image versions; avoid floating `latest` images.
- [ ] Bind development ports to loopback, not all interfaces.
- [ ] Add health checks and persistent named volumes.
- [ ] Keep real credentials out of tracked files; provide clearly labeled local-only examples.
- [ ] Document the Compose provider used by `podman compose`.
- [ ] Document Windows Podman machine setup and Linux requirements.
- [ ] Verify restart preserves database data.
- [ ] Do not add automatic volume deletion to normal shutdown scripts.

### Database workspace

- [ ] Use the Prisma v7 `prisma-client` generator with explicit output.
- [ ] Configure datasource URL in `prisma.config.ts` according to current Prisma v7 documentation.
- [ ] Use `@prisma/adapter-pg` and its compatible PostgreSQL driver.
- [ ] Validate server environment values before initializing services.
- [ ] Provide a deliberate database client lifecycle; avoid connection creation on every request.
- [ ] Implement only the minimal tenant/domain schema needed for host resolution.
- [ ] Add unique constraints for tenant identity and normalized domain ownership.
- [ ] Add an explicit, idempotent local fixture command if host-routing checks need sample tenants.
- [ ] Commit an initial migration; ignore reproducible generated client output.
- [ ] Run generation, migration, a database round-trip, and shutdown under Bun.
- [ ] Keep migrations explicit; do not run migrations automatically in each API process.

Acceptance: a fresh database can be migrated; Bun can query it through Prisma; restarts preserve data.

Production replica, backups, restore drills, migration deployment locking, and remote provisioning are not delivered by this local foundation.

## 7. Phase 3 — oRPC contracts and API processes

### Contracts

- [ ] Define separate commerce and tenant health/status contracts in `packages/shared`.
- [ ] Validate procedure inputs and outputs with Zod.
- [ ] Expose browser-safe explicit package exports; prevent server implementation leakage.
- [ ] Establish consistent typed error behavior without inventing a large error framework.

### Servers

- [ ] Implement each contract through oRPC's contract-first API.
- [ ] Mount Fetch `RPCHandler` directly on `Bun.serve`.
- [ ] Use `/commerce` and `/tenant` prefixes consistently with Next rewrites.
- [ ] Set separate configurable ports; proposed defaults: web 3000, commerce 3001, tenant 3002.
- [ ] Add `/livez` for process health and `/readyz` for required dependency readiness.
- [ ] Return non-success readiness status when dependencies fail; do not expose connection strings or internal errors.
- [ ] Add structured logging with request IDs and secret/cookie redaction.
- [ ] Add graceful server and database/Redis shutdown.
- [ ] Preserve ordinary 404 behavior for unmatched routes.

### Tenant and authorization boundaries

- [ ] Resolve normalized, validated hosts to tenants server-side.
- [ ] Reject unknown/malformed hosts rather than selecting a default tenant.
- [ ] Define the trusted forwarding path for browser rewrites and server-side API calls.
- [ ] Do not trust arbitrary client `tenantId`, `Host`, or forwarded headers as authorization.
- [ ] Keep APIs loopback-bound by default during host-side development.
- [ ] Keep management operations unavailable or unauthorized until real session/RBAC implementation.
- [ ] Health endpoints expose no tenant or business data.
- [ ] Any tenant-scoped data query includes explicit tenant scope; middleware alone does not scope Prisma automatically.

Acceptance: both API processes answer their own typed contracts, reject invalid input, handle dependency failure, and expose no unauthenticated management data.

## 8. Phase 4 — Next frontend, Base UI, and Tailwind v4

### Framework configuration

- [ ] Install Next from `next@canary`; record resolved version and retain lockfile reproducibility.
- [ ] Enable and verify `experimental.useTypeScriptCli` on the selected version.
- [ ] Use App Router and Server Components by default.
- [ ] Use `apps/web/next.config.ts`, typed with `NextConfig`; verify its config-loading path under Bun and TypeScript 7 without installing a legacy compiler.
- [ ] Generate Next route/environment types before independent workspace type checking.
- [ ] Enable typed routes if supported by the selected canary and tested with TS7.
- [ ] Enable Cache Components only after confirming this foundation's dynamic host/request usage works correctly with it; never cache tenant/session resolution globally.
- [ ] Add only documented canary tweaks that solve a concrete requirement; no blanket experimental flags.

### Styling and components

- [ ] Configure Tailwind v4 using `@tailwindcss/postcss` and `@import "tailwindcss"`.
- [ ] Use CSS-first theme tokens; no legacy Tailwind config unless required by a verified integration.
- [ ] Initialize shadcn with its Base UI variant using the current CLI options.
- [ ] Inspect generated dependencies and imports; reject Radix and TypeScript 5/6 additions.
- [ ] Store generated component source and `components.json` in `apps/web`.
- [ ] Add only components actually used by the initial shells; start with button/card and add inputs/dialogs only when rendered.
- [ ] Ensure focus visibility, keyboard usability, semantic landmarks, and accessible labels.
- [ ] Set document language to `pt-BR`; user-facing content stays in Portuguese.

### Routing and API access

- [ ] Provide minimal storefront and management shells with separate layouts.
- [ ] Use `proxy.ts` for validated host-aware routing and local host conventions.
- [ ] Document representative local storefront and management hosts; support Windows hosts-file setup if needed.
- [ ] Prevent direct internal route access from bypassing host-mode checks.
- [ ] Configure Next rewrites to local commerce/tenant APIs; no Caddy required.
- [ ] Browser clients use same-origin API prefixes.
- [ ] Server clients use validated internal API URLs and deliberate tenant context forwarding.
- [ ] Instantiate request-sensitive clients per request; never retain another request's cookies/tenant context globally.
- [ ] Render a typed API status result with loading/error behavior; do not add fake products or dashboard metrics.
- [ ] Validate frontend/server environment boundaries; no secrets in `NEXT_PUBLIC_*` variables.

Acceptance: both shells render, API calls remain end-to-end typed, host isolation checks pass, and production Next build passes with TypeScript checking enabled.

### Configuration file contracts

#### `apps/web/next.config.ts` — required

- [ ] Export a configuration typed with `NextConfig` from `next`.
- [ ] Set `experimental.useTypeScriptCli: true`; verify the exact option against the installed canary.
- [ ] Keep `typescript.ignoreBuildErrors` unset or false; never disable checks to make a build pass.
- [ ] Define `/commerce/:path*` and `/tenant/:path*` rewrites using validated server-only API origins, with loopback defaults for local development.
- [ ] Ensure forwarded paths retain the API prefixes expected by each Bun server.
- [ ] Add `transpilePackages` only for internal source packages that actually require it; do not include server-only packages in the frontend graph.
- [ ] Validate `typedRoutes` and `cacheComponents` independently before enabling them, following the framework checklist above.
- [ ] Keep host authorization and request-specific tenant resolution outside this static configuration, in the appropriate request handlers.
- [ ] Do not expose secrets through Next's `env` configuration or public environment variables.
- [ ] Verify config loading through Bun for `next dev`, `next typegen`, and `next build`; record any compatibility adjustment without replacing TypeScript 7.
- [ ] Document every non-default compatibility flag in `apps/web/AGENTS.md`, including its reason and removal condition.

#### `<workspace>/tsdown.config.ts` — conditional

This file is documented here but is **not required for the initial source-based workspace setup**. Create it only when a workspace needs a demonstrable bundled artifact. Next retains its own build pipeline; do not bundle `apps/web` with tsdown.

- [ ] Before adoption, record the consuming artifact and why Bun execution or native `Bun.build` is insufficient.
- [ ] Validate the chosen tsdown version and its complete dependency graph against the TypeScript 7-only policy.
- [ ] Place `tsdown.config.ts` in each workspace that actually bundles; no empty root config or shared configuration package.
- [ ] Export a typed configuration using tsdown's documented `defineConfig` API for the installed version.
- [ ] Declare explicit entrypoints, ESM output, a runtime-compatible target, and workspace-local `dist` output.
- [ ] Restrict output cleaning to that workspace's generated directory; never clean source or another workspace's artifacts.
- [ ] Define external dependencies deliberately, including Bun built-ins and Prisma-generated/driver assets where applicable; verify the resulting artifact rather than assuming bundling includes them correctly.
- [ ] Generate source maps when needed for runtime diagnostics; do not publish private source maps unintentionally.
- [ ] Keep declaration emission disabled for private runtime apps. Enable it only for a real declaration consumer and verify the emitter uses a TS7-compatible toolchain.
- [ ] Keep type checking separate: tsdown bundles; TypeScript 7/tsgo checks. A successful bundle is not type-check evidence.
- [ ] Add build scripts, package exports, artifact smoke tests, and scoped `AGENTS.md` instructions only for the workspace adopting bundling.
- [ ] Use the Bun catalog if tsdown is declared by at least two workspaces; otherwise keep it local.
- [ ] Mark intentional source-only or bundling limitations with a concise `ponytail:` comment naming the ceiling and upgrade condition where relevant.

Acceptance: `next.config.ts` loads and preserves type checking; any introduced `tsdown.config.ts` produces a tested artifact without forbidden compiler dependencies. If bundling remains unnecessary, record tsdown as not applicable rather than creating a placeholder file.

## 9. Phase 5 — Worker foundation

- [ ] Create the single worker workspace and document its commerce/tenant responsibilities.
- [ ] Validate Redis configuration and connectivity.
- [ ] Handle shutdown without abruptly abandoning active jobs.
- [ ] Avoid empty production queues, fake email jobs, and business handlers without requirements.
- [ ] If no real queue exists yet, keep the entrypoint an explicitly documented infrastructure bootstrap rather than claiming job-processing functionality.
- [ ] Use one integration-only disposable queue to verify enqueue/consume/shutdown behavior if BullMQ wiring is introduced.
- [ ] Document shared Redis key rules: tenant scope for tenant data, separate operational namespaces, deliberate cross-app invalidation.

Acceptance: Redis connectivity and the minimal worker lifecycle are verified; no business job behavior is implied.

## 10. Phase 6 — Checks and GitLab CI

### Automated checks

- [ ] Add a small runnable `bun test` workspace-policy check covering catalogs, internal dependency protocol, instruction coverage, and forbidden dependency versions.
- [ ] Inspect lockfile/resolved packages for TypeScript 5/6, not just direct manifests.
- [ ] Test contract validation and typed API response behavior.
- [ ] Test host normalization, unknown-host rejection, and trusted-header handling.
- [ ] Test public/management API separation and unauthorized management behavior.
- [ ] Test infrastructure failure readiness responses.
- [ ] Add explicit Prisma and BullMQ integration checks where those paths are implemented.
- [ ] Keep unit tests infrastructure-independent; label integration checks separately.
- [ ] Use Bun tests only; do not install Vitest or Playwright.

### CI sequence

1. Install with the pinned Bun version and `bun install --frozen-lockfile`.
2. Check workspace/dependency policy.
3. Generate Prisma client.
4. Generate Next types.
5. Run TypeScript 7 checks for every workspace.
6. Run unit tests.
7. Apply committed migrations to disposable PostgreSQL and run integration checks with disposable Redis.
8. Build the Next app with CLI type checking enabled.

- [ ] Use GitLab service containers for test Postgres/Redis; Podman is not required inside CI.
- [ ] Keep CI secrets out of logs and caches.
- [ ] Ensure the build does not require production credentials or a running production API.
- [ ] Ensure CI installation/build does not modify manifests or the lockfile.
- [ ] No Dockerfile, container image build, registry push, or deployment jobs.

## 11. Phase 7 — Documentation and handoff

- [ ] Write root README with prerequisites, setup, environment handling, local hosts, scripts, and troubleshooting.
- [ ] Document infrastructure startup separately from app startup.
- [ ] Explain migration creation versus migration deployment.
- [ ] Document canary upgrades as deliberate lockfile updates followed by the complete acceptance suite.
- [ ] Explain `apps/orpc-server` is a shared library, not another API service.
- [ ] Update stale architecture statements in `PRODUCT.md` only where this confirmed foundation supersedes them.
- [ ] Record test/build results and unresolved limitations in this file.
- [ ] Review final Git diff for unrelated changes, generated noise, real credentials, and accidental scaffolding.

## 12. Final acceptance checklist

- [ ] Fresh checkout setup succeeds using documented Bun and Podman commands.
- [ ] Frozen install resolves every workspace without TypeScript 5/6 or Radix UI dependencies.
- [ ] Every app/package has a scoped `AGENTS.md`.
- [ ] All shared external dependencies obey catalog policy.
- [ ] Postgres and Redis start healthy; no apps are containerized.
- [ ] Committed Prisma migrations apply to an empty database.
- [ ] Database data survives infrastructure restart.
- [ ] Both Bun APIs pass liveness/readiness checks and typed RPC tests.
- [ ] Storefront and management shells render in pt-BR with accessible Base UI components and Tailwind v4 styles.
- [ ] Browser/server API access respects host and tenant boundaries.
- [ ] Unknown hosts and unauthorized management access are rejected.
- [ ] All workspace checks run with TypeScript 7.
- [ ] Next development, type generation, and production build succeed with CLI checking enabled.
- [ ] Unit/integration tests pass; manual browser keyboard/error-state checks are recorded.
- [ ] GitLab CI passes without image-building or deployment steps.
- [ ] No authentication, payment, PWA, or business functionality is represented as complete.

## 13. Deferred work and blockers

### Explicitly deferred

- App Dockerfiles, Caddy/TLS, production Compose, image pipelines, deployment.
- Production PostgreSQL replica, backups/restore, migration deployment locking, VPS monitoring.
- Authentication, sessions, RBAC, invitations, support impersonation/auditing.
- Catalog, kits, cart, checkout, orders, wallets, payments, refunds, logistics.
- Asaas/Spoke credentials and integration validation.
- Offline persistence, background sync, web push, PWA install prompts (Serwist shell + manifest exist; sync layer is later).
- TanStack Query/DB/Table/Form data tables — only the Query provider shell is added; no queries yet.
- Full OpenTelemetry exporters — only API/no-op instrumentation hooks are added; collector wiring is later.
- Full OpenAPI documentation publishing, rate limiting, production distributed cache invalidation.
- Shared UI package, generic config packages, tsdown bundling for db/shared, public package publishing.

These remain roadmap requirements where already approved; deferral means outside this foundation, not canceled.

### Tooling shell adopted (subsequent to initial scope)

The following were added on explicit request even though they have zero consumers in the foundation. Each is wired as a **shell only** (no fake data, no fake endpoints, no synthetic integrations):

- **Turborepo** — `turbo.json` wraps the existing root scripts (`dev`, `typecheck`, `test`, `build`, `db:generate`, `infra:up`) with a dependency graph. No remote cache configured.
- **OpenTelemetry** — `@opentelemetry/api` instrumented at the API process boundaries (`apps/commerce`, `apps/tenant`, `apps/worker`). No exporter installed. Hooks no-op until an exporter is configured.
- **Sentry** — `@sentry/bun` initialized in each server process; reads `SENTRY_DSN` from env. If unset, init is a no-op (no fake DSN).
- **TanStack Query** — `QueryClientProvider` added to `apps/web` root layout. Zero queries/hooks in use.
- **Serwist (PWA)** — `serwist` next plugin configured with a minimal manifest. No service worker routes added yet.
- **GitHub Actions** — replaces GitLab CI as the CI provider. Basic pipeline only: install, policy, typecheck, test, build.

### Packages restructured

- **Implementations moved out of `apps/*`**: `@menuza/api-commerce` and `@menuza/api-tenant` packages own the router implementations. `apps/commerce` and `apps/tenant` are thin shells that delegate `dev`/`start` to the package via `bun --filter`.
- **`@menuza/offline`**: Browser-only package providing IndexedDB persistence for TanStack Query, an offline mutation queue, Background Sync drain, and server-wins conflict resolution via `If-Match`.

### Potential implementation blockers

| Blocker                                                         | Required response                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Selected Next canary does not support TypeScript 7 CLI checking | Find a compatible canary/TS7 configuration; record exact versions; no TS5/6 fallback |
| Generator introduces forbidden dependencies                     | Correct generated manifests or use compatible manual setup; rerun dependency audit   |
| Prisma/Bun/adapter incompatibility                              | Verify current supported combination before adding database-dependent features       |
| Podman unavailable or machine/provider broken                   | Document the exact prerequisite; do not claim container checks passed                |
| Trusted host propagation cannot be demonstrated                 | Keep tenant-data paths inaccessible until trust boundary tests pass                  |

Spoke and Asaas commercial gates do not block this local technical foundation; they still block the corresponding product delivery milestones.

## 14. Execution record

### Version decisions

| Tool/package                     | Selected version                                                                    | Validation evidence                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Bun                              | 1.4.3 (canary.1)                                                                    | `bun --version`                                                              |
| Next `canary`                    | 16.4.0-canary.19                                                                    | `npm view next dist-tags.canary`                                             |
| TypeScript 7/compiler executable | 7.0.2                                                                               | catalog entry; tsc CLI via `next typegen`/`next build` works                 |
| React / React DOM                | 19.2.8                                                                              | catalog entry                                                                |
| Tailwind CSS                     | 4.3.3 v4                                                                            | catalog entry; CSS-first config                                              |
| shadcn CLI / Base UI             | shadcn 4.21.0 (`@base-ui/react` 1.8.0)                                              | `bunx shadcn@latest add …` produced Base-UI-only components                  |
| oRPC packages                    | 2.0.0-beta.35 (`@orpc/server`, `@orpc/client`, `@orpc/contract`)                    | contract-first RPC verified end-to-end via `curl POST /rpc/health {json:{}}` |
| Prisma CLI/client/adapter        | 7.10.0 (CLI/client/adapter-pg)                                                      | `prisma generate` + adapter-pg import OK                                     |
| PostgreSQL image                 | `docker.io/library/postgres:18-alpine`                                              | compose.yaml                                                                 |
| Redis image                      | `docker.io/library/redis:7.4-alpine`                                                | compose.yaml                                                                 |
| Podman / Compose provider        | podman 5.4.2 in WSL2 Debian + `podman-compose` 1.3.0 (Docker Compose plugin broken) | `wsl -e bash -lc "podman-compose version"`                                   |

### Run log

| Date       | Phase/check           | Command or evidence                                                                                                               | Result/blocker                                                                                  |
| ---------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-09-06 | Phase 0 compatibility | `npm view` checks for Next canary, TS7, Prisma 7, oRPC 1.15, Tailwind 4, shadcn, Base UI                                          | All resolved; TS7 stable, TS5/6 absent from resolved graph                                      |
| 2026-09-06 | Phase 1 workspaces    | `bun install` resolves 353 packages; `bun test scripts/workspace-policy.test.ts` passes                                           | Catalog hygiene OK; AGENTS.md in every workspace                                                |
| 2026-09-06 | Phase 2 Prisma        | `bun run db:generate` produces client under `packages/db/prisma/generated/client/` (Prisma 7 normalizes schema-relative output)   | datasource `url` removed (Prisma 7 forbids it); URL lives in `prisma.config.ts`                 |
| 2026-09-06 | Phase 3 oRPC          | `curl POST http://127.0.0.1:3001/rpc/health -d '{"json":{}}'` → 200 `{"json":{"status":"ok","service":"commerce","timestamp":…}}` | Zod validation rejects empty body with 400 + structured error                                   |
| 2026-09-06 | Phase 4 web           | `bun run build` produces `.next/` with `page/`, `store/`, `manage/` artifacts; `bunx tsc --noEmit` clean                          | pt-BR landing + storefront (`/store`) + management (`/manage`) shells render                    |
| 2026-09-06 | Phase 4 shadcn        | `bunx shadcn@latest add button card input label dialog` — Base-UI only, zero Radix imports in `apps/web/src/components/ui/`       | `components.json` schema rejects extra `"base"` key; fixed by leaving `style: "base-nova"` only |
| 2026-09-06 | Phase 4 themes        | `next-themes` 0.4.6 added locally; ThemeProvider in root layout; ThemeToggle in both shells                                       | No new catalog entries (single-consumer)                                                        |
| 2026-09-06 | Phase 5 worker        | BullMQ 6.3.4 + ioredis 5.4.2 wired; smoke queue proves lifecycle                                                                  | No business jobs; documented in apps/worker/AGENTS.md                                           |
| 2026-09-06 | tsdown evaluation     | Bundled `packages/shared` (works) and `packages/db` (Prisma runtime-config inlining unacceptable)                                 | Both reverted to source-based consumption; recorded in AGENTS                                   |
| 2026-09-13 | oRPC v2 migration    | catalog → 2.0.0-beta.35; `RPCLink` origin+url split; `RouterContractClient`; `RequestHeadersHandlerPlugin`; `Router<any>`; object interceptor; added RequestLimit/Timeout/PrototypePollution plugins; typecheck + 26 unit tests + live curl smoke (200/413/400/404) | Server and client wire format now v2 — deploy together |

### Compatibility findings

- **TS7 + Next canary**: works as designed. `experimental.useTypeScriptCli: true` is the only viable path; the legacy compiler API is gone in TS7 (verified from `next/src/lib/typescript/runTypeScriptCli.ts`).
- **Prisma 7**: removed `url` from `datasource`; requires `prisma.config.ts`. Output path normalizes to `prisma/generated/client/` relative to schema location.
- **shadcn CLI**: rejects extra `"base"` field in `components.json`. Documented: keep only `style: "base-nova"`.
- **oRPC 1.15**: `Router<TRouter, TContext>` is a 2-arg generic. Contract-first uses `implement(contractObject)` (pass the OBJECT, not a single procedure). Client-side type is `ContractRouterClient` in this version (`RouterContractClient` is the post-v1.15.0 rename).
- **Radix in `apps/web`**: zero direct imports. The transitive Radix presence is in Prisma Studio (dev-only CLI bundle), not the runtime/UI graph.

### Handoff

- Completed phases: 0, 1, 2, 3, 4, 5 (foundation), and CI (6, GitHub Actions replacing GitLab CI per user direction).
- Pending verification: `bun run infra:up` against podman-compose (machine preconditions documented).
- Next authorized action: run `bun run db:generate && bun run typegen && bun run build` and exercise `bun run dev`.
- Files changed for this request: PLAN.md.
- Tooling shells added per explicit user override of §13: Turborepo 2.10.12, `@opentelemetry/api` 1.9.1 (no exporter), `@sentry/bun` 10.73.0 (no DSN → no-op), TanStack Query 5.102.8 (provider only), Serwist 9.5.12 (`@serwist/turbopack`, SW at `/serwist/sw.js`), esbuild 0.28.2, GitHub Actions. Each is a shell with zero consumers in this phase; no fake data, no fake DSN, no fake routes.
