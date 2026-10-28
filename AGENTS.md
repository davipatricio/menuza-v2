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
- Shared server and auth/tenant procedure plumbing in `@menuza/orpc-server` (`/fetch`, `/tenant`, `/auth`, `/internal`).
- Browser-side offline support directly in `apps/web/src/offline` (IndexedDB persister, mutation queue, Background Sync drain).
- Database in `@menuza/db` (Prisma 8 + `@prisma/orm-postgres`, contract-based, owns async tenant scoping).
- Pagar.me client and webhook adapter in `@menuza/pagarme-api-client` (outbound transport, credential parsing, webhook validation).
- One BullMQ worker process (`apps/worker`).
- Local infrastructure: Postgres + Redis + Jaeger via Podman Compose (`infra/compose.yaml`).

## Versions (locked)

- Bun canary channel — the moving `canary` release (workspaces, package manager, runner, test runner; `bun check` for type checking). No immutable 1.4.4 build exists to pin. Pinned in `devEngines.packageManager`, `.github/workflows/ci.yml` (`env.BUN_VERSION`) and the `oven/bun:canary` image tags.
- TypeScript 7.0.2 only. No TS 5/6 fallback.
- Next `16.4.2` (stable) with `experimental.useTypeScriptCli: true`.
- React 19.3.1, React DOM 19.3.1.
- Valibot 1.5.0 (catalog; Standard Schema for all oRPC `.input`/`.output`/error
  `data` schemas). No Zod in first-party code — transitive Zod remains via
  `@serwist/*`, `shadcn`, `@modelcontextprotocol/sdk`.
- Tailwind 4.3.3 + `@tailwindcss/postcss` 4.3.3.
- shadcn (Base UI variant on `@base-ui/react` 1.9.0; components in `apps/web/src/components/ui/`).
- oRPC 2.0.0-beta.35 (`@orpc/server`, `@orpc/client`, `@orpc/contract`,
  `@orpc/openapi`). v2 wire
  format is incompatible with v1 — server and client deploy together.
- Prisma CLI `8.0.0-rc.27`, `@prisma/orm-postgres` `8.0.0-rc.20` (RC pin; bump CLI and
  ORM package together — wire/marker formats are versioned together). rc.27 requires
  `@@check(expression: sql`...`)` — a quoted string is refused.
- BullMQ 6.3.14 over Bun's built-in `RedisClient` (adapter; ioredis removed).
- Turborepo 2.11.9 (task DAG + local cache; no remote cache).
- OpenTelemetry API 1.9.1; trace SDK + OTLP HTTP exporter (2.12.0 / 0.223.0) and
  `bullmq-otel` 2.0.1.
- Sentry Bun 11.8.0 (APIs) + Sentry Next.js 11.8.0 (web); init is a no-op
  without the DSN. LGPD PII scrubbing lives in `@menuza/shared/sentry-privacy`.
- TanStack Query 5.104.4 (provider shell; queries used by the coupons screens).
- Serwist 9.5.13 (`@serwist/next`, `@serwist/turbopack`; SW compiled by esbuild and served at `/serwist/sw.js`).
- esbuild 0.28.2 (Serwist SW bundler).
- `@tanstack/query-persist-client-core` 5.104.4, `@tanstack/react-query-persist-client` 5.104.4, `idb-keyval` 6.3.0 (offline persister).
- GitHub Actions: `.github/workflows/ci.yml` — six jobs (`policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`), actions pinned by commit SHA, Bun from the `canary` channel.

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
- Web ships Next `output: "standalone"` and runs `server.js` on Bun (`oven/bun:canary-slim`; every image builds on `oven/bun:canary`).
- Images are hermetic from env: scripts use `--env-file-if-exists`, so builds work without `.env`; runtime config is env-only. Never bake `.env`.
- API images bind `HOST=0.0.0.0` (env baked in image); local dev stays loopback (default `127.0.0.1`).
- CI compiles the binaries in the `build` job. No image pipeline, no deploy.

### Build pipeline: turbo prune + bytecode

- **Builds go through `bun run scripts/docker-build.ts <app>`** — runs `turbo prune <app> --docker` into `.turbo/prune/<app>` (json/ = pruned manifests + lockfile, full/ = source), then builds `apps/<app>/Containerfile` with the pruned dir as context. Context is tiny and install layers are per-service (worker: 84 pkgs). Prune output is gitignored.
- **Bytecode is on** (`--compile --bytecode --format=esm --minify --sourcemap` in the three Bun `build` scripts). ESM bytecode requires `--compile` + `--format=esm`; without `--format=esm` the CJS default fails on top-level `await`. Bytecode is tied to the exact Bun version — images bake the moving `oven/bun:canary` tag, so bytecode regenerates on every image build. Never commit `.jsc`/embedded bytecode as a release artifact outside images.

## Commands

- `bun run dev` — concurrent runnable app processes.
- `bun run typecheck` — `bun check` (Bun's built-in TS 7 checker) across workspaces (after `db:generate` and `typegen`).
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — Prisma generate, Next typegen, Next build with type checking.
- `bun run lint` / `bun run fmt:check` — oxlint + oxfmt via turbo.
- `bun run db:generate` (contract emit) / `db:migrate` (migration plan) / `db:deploy` (db migrate) — Prisma 8 lifecycle.
- `bun run infra:up` / `infra:down` — Postgres + Redis + Jaeger.
- `bunx turbo run <task>` — Turborepo task DAG with local cache (e.g. `turbo run build`, `turbo run typecheck`).

### Lint/format baselines

- Repo-wide `bun run lint` / `bun run fmt:check` go through turbo; check your own
  paths instead of trusting a repo-wide exit code: `bunx oxfmt <paths>` then
  `bunx oxlint <paths>`.
- `anti-slop/require-readable-spacing` is autofixable (`bunx oxlint --fix <paths>`);
  re-run the formatter and lint afterwards and confirm a second pass changes nothing.
- Format only the files a change touches — a package-wide `bun run fmt` rewrites
  unrelated files.

## Git hooks

- Husky 9 + lint-staged 17. `prepare: husky` in root `package.json`; hook at
  `.husky/pre-commit` (plain POSIX script, no `husky.sh` sourcing) runs
  `bunx lint-staged`.
- `.lintstagedrc.json`: staged `*.{ts,tsx,js,jsx,mjs,cjs}` get `bunx oxfmt` then
  `bunx oxlint --fix`; staged `*.{json,jsonc,md,css}` get `bunx oxfmt` only.
- The hook only sees staged files. CI remains the repo-wide gate.
- Never bypass with `--no-verify` unless the user explicitly asks.
- `.husky/_/` is generated and gitignored; `.husky/pre-commit` is tracked.

## Definition of done

Run the canonical checks in this order, and report the result of each:

1. `bun run design:check` — dashboard UI only (`apps/web/DESIGN.md`).
2. `bun run typecheck`
3. `bun test`
4. `bun run lint`
5. `bun run fmt:check`
6. `bun run build`

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

### Flag better options

- Assume the user can be wrong. When a request has a materially better, cheaper, faster, or more
  accessible alternative — model, provider, service, free tier, algorithm, UI, accessibility — name
  it with the tradeoff and recommend it. A line or two, not a lecture.
- Don't silently substitute or block the user: surface the alternative, ask whether to continue as
  asked, then do what the user decides.
- In full-autonomous mode, skip the round-trip and take the better option, stating the choice made.

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

### Version control

- Don't `git commit` or `git push` unless the user explicitly asks for it. Completing a task is not
  permission to commit.
- Don't stage, amend, or otherwise "tidy up" the working tree either; leave it as the user left it.
- Only force-push, rebase, `reset --hard`, or delete branches when the user asks.

## Anti-patterns

- No empty abstraction packages ("for later").
- No single-consumer packages: code consumed by only one app lives directly in that app (e.g. offline queue in `apps/web/src/offline`).
- No micro-packages for middleware or utilities: shared server middleware/auth lives in `@menuza/orpc-server/*` or `@menuza/db/scope`, not in separate `packages/auth-core` or `packages/tenant-context`.
- New packages require explicit justification and must be registered in `scripts/workspace-policy.test.ts` allowlist.
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
- **TanStack Query**: `QueryProvider` in `apps/web` root layout (persisted via IndexedDB). The coupons screens are the first consumers (`useQuery`/`useMutation` in `coupons-table.tsx` / `coupon-form.tsx`); the offline mutation queue in `apps/web/src/offline` drains it.
- **Serwist (PWA)**: `next.config.ts` wrapped with `withSerwist`; service worker at `/serwist/sw.js`; manifest at `/manifest.webmanifest`; `SerwistProvider` in root layout. Background Sync drain wired.
- **Web Push**: VAPID, implemented end to end — sender and dispatcher in `apps/worker` (`src/push-sender.ts`, `src/push-dispatcher.ts`), subscription/preference routes in the `@menuza/api-tenant` push subdomain, contract in `@menuza/shared/push`. `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` are declared in `.env.example`; leaving any empty disables push.
- **GitHub Actions**: `.github/workflows/ci.yml` — six jobs (`policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`), actions pinned by commit SHA, Bun from the `canary` channel. No image pipeline, no deploy.

## Agent skills

### Menuza product skill

Product meaning, features, technical decisions and the checks every change must pass live in the
`menuza` skill (`.agents/skills/menuza/`). Load it when a task touches a Menuza feature or a
`MEN-` ticket.

- Entry point: `.agents/skills/menuza/SKILL.md` — the router (always-true invariants + topic table).
- Only know a word, not a topic? `.agents/skills/menuza/INDEX.md` is the flat keyword → file map.
- Every folder and subfolder has its own `INDEX.md` with a keyword table:
  - `product/` — vision, tenancy, MVP scope, open decisions, glossary.
  - `features/` — `stores-and-teams/`, `storefronts/`, `catalog/`, `payments/`, `delivery/`,
    `orders/`, `customers/`, `notifications/`, `admin/`, `integrations/`.
  - `engineering/` — stack and ADRs, the monorepo map, the backend request path, route
    rendering stages, checks, follow-ups.
  - `tickets/` — how to query Linear, the roadmap epics, the ticket → module map.
- `PRODUCT.md` (root, numbered sections) and Linear stay authoritative; the skill distils and maps
  them onto the code. Before calling a feature done, run `engineering/checks.md`.

### Skill tiers

Skills overlap, so load by tier — never all at once.

- **Tier 0 — always on for UI work:** `shadcn` (existing components first, semantic
  tokens, `FieldGroup`+`Field`, `gap-*` not `space-*`, overlays with `Title`,
  `Avatar` with `Fallback`) and `menuza` (invariants + checks). Dashboard work
  additionally follows `apps/web/DESIGN.md`; verify with `bun run design:check`.
- **Tier 1 — checkers, on demand:** `better-accessibility` (focus, ARIA, contrast),
  `better-layout` (responsive, no page-level horizontal overflow). Housekeeping:
  `housekeeping` (repo-wide pass: probe reality, record a temporary `FINDINGS.md`
  checkbox board, parallel read-only audit lanes, parallel disjoint-file fix wave,
  full verify chain; never commits, never stages) then `dead-code-auditor` (reports
  only — six categories, evidence-backed, never deletes; ends by offering a `/plan`)
  and `ai-slop-cleaner` (bounded to the calling task's changed files; behavior lock
  and fallback classification first, passes 1–4, never masks architectural
  blockers). All three respect Surgical changes: unrelated dead code is mentioned,
  not deleted.
- **Tier 2 — one generator at a time:** `frontend-design` for product UI xor
  `design-taste-frontend` for marketing hero work. Never both on the same task.
- **Tier 3 — do not auto-load:** `better-colors`, `better-typography`, `better-ui`,
  `better-writing`, `better-interface`, `web-design-guidelines`,
  `vercel-composition-patterns`, `vercel-react-best-practices`, `interface-review`,
  `explain-interface`, `variant`. Invoke by name only when the task is exactly that slice.
- Backend/tooling skills (`orpc*`, `prisma-8`, `next-*`, `install-anti-slop`, `break`)
  are outside this tiering; load them by task as before.

### Issue tracker

Issues live in Linear (workspace Menuza, team Menuza) via Linear MCP tools. See `docs/agents/issue-tracker.md`.

**Linear is the only ticket store.** No ticket list, status, priority or inventory is mirrored into this repo — not in docs, not in the skill, not in code comments. Cite a `MEN-###` to point at the tracker; never record its state locally.

#### Querying Linear correctly

Team selector is `team: "Menuza"` (key `MEN`); issue ids are `MEN-###` strings passed as `id`.

- `list_issues` `fields` is a closed whitelist. Valid, and the ones worth asking for: `id`, `title`,
  `status`, `statusType`, `priority`, `estimate`, `labels`, `assignee`, `project`, `parentId`,
  `createdAt`, `updatedAt`, `completedAt`, `canceledAt`, `url`. `identifier`, `state` and `relations`
  are **not** fields — the `id` already is `MEN-###`, and state is `status` (display name) plus
  `statusType` (`backlog | unstarted | started | completed | canceled | duplicate`).
- `list_issues` **never returns relations**. Read blockers with one `get_issue({ id, includeRelations: true })`
  per issue; the relations come back under `relations.blockedBy` / `relations.blocks` / `relations.relatedTo`.
- Status names are custom (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`,
  `Duplicate`, `Anotações`). Filter on `statusType`, not the name — "Done" is `completed`, not `Completed`.
- `limit` caps at 250 and pages via `hasNextPage` + `cursor`. One 250-item fetch of the whole team is
  the cheap path: fetch once, filter in code, rather than paging per status or per parent.
- Roadmap maps are parent issues — `MEN-63` (MVP), `MEN-64` (post-MVP immediate), `MEN-65` (future) —
  and their tickets come back via `parentId`.
- **Blocker and ordering live in ticket prose, not in relations** — the relations graph is barely used
  here, so an empty `blockedBy` does not mean a ticket is ready. Read its description and
  `list_comments` before judging what is next; "X must land before Y" is written in the body.
- When writing Markdown to `save_comment` / `save_issue`, send real newlines; never escape sequences.

When reporting on issues to the user, never cite an identifier alone (`MEN-179`): always pair it with the issue title
(or a short summary of it), e.g. `MEN-179 — Next.js 16.4 canary + RSC + Cache Components`. Applies to lists, tables and
prose. The identifier goes first so it stays copy-pasteable; the title makes it readable without opening Linear.

### Triage labels

Default five canonical roles used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
