# Menuza — root AGENTS.md

## Architecture

- Bun workspaces monorepo (`apps/*`, `packages/*`) plus one Cargo workspace (`crates/*`).
- One TanStack Start app (`apps/web`; Start + Router + Query on Vite), three pathless route groups in `apps/web/src/routes/`:
  - `_marketing` (`/`, `/about`, `/pricing`, `/contact`) — static.
  - `_storefront` (`/store`, `/menu`, `/menu/$productId`) — buyer store, tenant host resolved server-side.
  - `dashboard` (`/dashboard`, `/dashboard/$storeSlug`) — admin, main domain only (ADR-0005; tenant hosts serve storefront only).
- The backend is six Rust crates on one Cargo workspace, two of them listening binaries (ADR-0007):
  - `crates/api-commerce` — axum binary on `:3001`: storefront, orders, wallet, payments.
  - `crates/api-tenant` — axum binary on `:3002`: panel, sessions, accounts, OAuth2 and MCP (`rmcp`).
  - `crates/contract` — DTOs, `utoipa` schemas and the closed error-code catalog. No IO.
  - `crates/persistence` — every SQL string, tenant-scoped query helpers, `migrations/`.
  - `crates/domain` — argon2, sessions, money as cents. No HTTP, no axum, no sqlx.
  - `crates/http` (package `menuza-http`) — the one tower stack and the extractors both binaries mount.
  - `crates/worker` — River consumer over the same Postgres pool. No listening port (ADR-0008).
  - `crates/openapi` — emit binary → `crates/openapi/{commerce,tenant}.json`.
- `packages/shared`: browser-safe types (`/commerce`, `/tenant`, `/push`, `/errors`), the shared money formatter (`/money`); its Valibot/oRPC contracts are legacy, the runtime contract is OpenAPI.
- `packages/api-client`: the one generated HTTP client for both Rust APIs — `src/{commerce,tenant}.ts` and `src/model/**` come from `crates/openapi/*.json` through Orval, `src/http.ts` is the hand-written mutator (`configureApi`, `resetApi`, `apiFetch`) that keeps web relative and makes native absolute.
- Two Expo apps sharing the same contract, money formatter and palette (MEN-313):
  - `apps/mobile-storefront` — buyer storefront; one published binary per large store, identified by `app.menuza.store.<tenantSlug>`, with the tenant read from `applicationId` at runtime and one EAS Update channel for every binary.
  - `apps/mobile-dashboard` — the operator app; one binary for every store, session cookie in `expo-secure-store`, native order-board tabs plus the Gestão stack mirroring the web sidebar.
- `packages/db`: historical husk — `prisma/contract.prisma` and the Prisma migration history only; the live schema is `crates/persistence/migrations/`.
- `apps/web/src/offline`: IndexedDB persister, mutation queue, Background Sync drain.
- `infra/compose.yaml`: Postgres + Redis + Jaeger via Podman Compose.

### Docs map

- `crates/AGENTS.md` is the workspace rule set; each crate carries its own (`contract`, `persistence`, `domain`, `http`, `api-commerce`, `api-tenant`, `worker`, `openapi`).
- `docs/agents/mobile.md` — Expo architecture and the Expo Go preview recipe; read it before touching either mobile app. Expo Go cannot load native modules it does not bundle, and a tunneled preview needs `EXPO_PACKAGER_PROXY_URL` plus the web origin.
- Nested `src/**/AGENTS.md` files state what is wrong or misleading one folder up: both `domains/` trees, the tenant subdomains (`panel`, `account`, `session`, `profile`, `push`, `public`, `internal`), `mcp/` and `oauth/`.
- Per-workspace rules: `apps/web/AGENTS.md`, `apps/mobile-storefront/AGENTS.md`, `apps/mobile-dashboard/AGENTS.md`, `packages/shared/AGENTS.md`, `packages/api-client/AGENTS.md`, `packages/db/AGENTS.md`.

### Mobile architecture (Expo SDK 58)

- Data pipeline: `screen → @menuza/api-client → apiFetch(origin, headers) → Rust API`. The client is generated from `crates/openapi/*.json`; no app hand-writes a fetch. Web calls the mounts relatively (`/commerce`, `/tenant`) and the proxy strips them; native binds an absolute origin once in `configureApi`.
- Storefront tenant: `applicationId` (`app.menuza.store.<slug>`) → `GET /commerce/stores/{slug}` → `tenantId` bound as `x-menuza-tenant-id`. A dev build asks for the slug once and stores it in SQLite.
- Dashboard tenant: `POST /tenant/session/login` → `menuza_tenant_sid` in SecureStore, bound as the `cookie` header by `bindSessionToken`; `/session/current` on boot; memberships drive the store picker.
- Theme: `PublicStore.theme` is resolved by the API (colors, WCAG ink, radius). Native writes the token names through `Uniwind.updateCSSVariables`; web writes CSS variables. Never derive a store color or compile one into the bundle.
- Dashboard navigation: four native tabs mirroring the web sidebar (Início, Pedidos, Catálogo, Mais); the order board's four queues are segments inside Pedidos, and Mais opens `src/app/management/**` (catálogo, cupons, clientes, auditoria, integrações, configurações) plus the store switch and sign-out.
- `NativeTabs.Trigger.Icon md="…"` needs `expo-symbols`; without it Android tab icons fail at runtime.
- Dashboard has a light/dark palette (`global.css` + `lib/theme-mode.tsx`, system/light/dark stored in SQLite); the storefront keeps the store's colors. `expo-image` + `memory-disk` caches storefront covers.
- New `pending` orders raise a local notification (`expo-notifications`) and deep-link to `/order/<code>`; remote push still needs a dev build and MEN-317.
- Predictive back (`android.predictiveBackGestureEnabled`) plus `Stack` slide gestures; editors guard unsaved work with `usePreventRemove`.
- Native controls come from `@expo/ui` (universal layer, in Expo Go): toggles are `Host` + `Switch`, the order-reason prompt is a `BottomSheet`. Never add `@gorhom/bottom-sheet` or a JS imitation of a native control.
- Motion is deliberately short: 90 ms press scale + haptic, 25 ms hub stagger, native stack slides.
- OTA: one EAS Update channel per app, static `runtimeVersion`; every store binary shares the storefront bundle.
- Preview: `docs/agents/mobile.md` has the Expo Go + tunnel recipe (`EXPO_PACKAGER_PROXY_URL`, `EXPO_PUBLIC_COMMERCE_URL` / `EXPO_PUBLIC_TENANT_URL`).

## Versions (locked)

- Bun canary channel — moving `canary` release (workspaces, package manager, runner, test runner; `bun check` type-checks). No immutable 1.4.4 build to pin. Pinned in `devEngines.packageManager`, `.github/workflows/ci.yml` (`env.BUN_VERSION`), `oven/bun:canary` image tags.
- TypeScript 7.0.2 only; no TS 5/6 fallback.
- Rust 1.95.0 from `rust-toolchain.toml` (rustfmt + clippy, edition 2024); 1.95 is River's MSRV and sqlx 0.9 needs 1.94. Do not lower it and do not add a nightly feature.
- axum 0.8.9, sqlx 0.9.0, utoipa 6.0.0 + `utoipa-scalar` 0.4.0, `rmcp` 3.8.0, `riverqueue` 0.4.0 — all pre-1.0, so every one is pinned with `=` in the workspace `Cargo.toml`.
- TanStack Start 1.169.4, TanStack Router 1.170.46, TanStack Query 5.104.4, Vite 8.3.5 (`@vitejs/plugin-react` 6.2.1); no Next.js in the repo.
- React 19.3.1, React DOM 19.3.1.
- Expo SDK 58.0.25, React Native 0.88.1, `expo-router` 58.0.31, Expo Modules 58.x and `@shopify/flash-list` 2.3.2 on the New Architecture; Uniwind 1.13.2 binds Tailwind 4 tokens to native. Native controls and sheets come from `@expo/ui` 58.0.28 (universal layer, works in Expo Go). `expo-updates` 58.0.22 with one static `runtimeVersion` per app; builds and OTA run through `eas-cli` 27.10.0.
- Valibot 1.5.0 and oRPC 2.0.0-beta.35 (`@orpc/contract`, `@orpc/openapi`) — legacy contracts in `packages/shared` only; every client is typed from the Rust OpenAPI documents. No Zod in first-party code; transitive Zod via `@serwist/*`, `shadcn`, `@modelcontextprotocol/sdk`.
- Tailwind 4.3.3 + `@tailwindcss/vite` 4.3.3.
- shadcn (Base UI variant on `@base-ui/react` 1.9.0; components in `apps/web/src/components/ui/`).
- orval 8.46.0 generates `packages/api-client/src/{commerce,tenant}.ts` and `src/model/**` from `crates/openapi/*.json` (`bun run api:generate` in `packages/api-client`); operation ids are the API, so renaming one breaks every caller.
- Turborepo 2.11.9 (task DAG + local cache; no remote cache).
- Sentry `@sentry/react`/`@sentry/node` 11.8.0 (web only, no framework integration); init no-op without DSN; LGPD PII scrubbing in `@menuza/shared/sentry-privacy`.
- TanStack Query 5.104.4 (`QueryProvider` in the root route, persisted to IndexedDB; `staleTime: 30_000` only for the product editor/create taxonomy).
- Serwist 9.5.13 (`serwist` runtime + `@serwist/build` used by the first-party `serwistWorker()` Vite plugin; SW emitted to `dist/client/serwist/sw.js`).
- `@tanstack/query-persist-client-core` 5.104.4, `@tanstack/react-query-persist-client` 5.104.4, `idb-keyval` 6.3.0 (offline persister).
- GitHub Actions: `.github/workflows/ci.yml` — eleven jobs (`policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`, `rust-fmt`, `rust-clippy`, `rust-test`, `rust-build`, `rust-schema`), actions pinned by commit SHA, Bun from the `canary` channel and Rust from `rustup show`.

## Bun/catalog rules

- Internal packages: `workspace:*`.
- Deps shared by ≥2 workspaces: root `workspaces.catalog`, consumed via `catalog:`.
- Single-consumer deps stay local.
- Bun lockfile only; CI uses `bun install --frozen-lockfile`.
- Tool/runtime versions pinned in `package.json`, documented here.

## Local Podman (Windows)

- Podman **inside WSL2** (Debian); the WSL Docker Compose plugin is broken, so `scripts/infra-up.ts` / `scripts/infra-down.ts` call `podman-compose` directly.
- Up: `bun run infra:up`; down (volumes kept): `bun run infra:down`.
- No WSL: install `podman-compose` standalone, run `podman-compose -f infra/compose.yaml up -d` from the repo root.

## Container images

- One `Containerfile` per service; today only `apps/web/Containerfile` exists. The Rust binaries deploy as `cargo build --workspace --release` artifacts, not images.
- Web: Vite `dist/` tree, `dist/server/server.js` on Bun (`oven/bun:canary-slim`; the build stage is `oven/bun:canary`).
- Hermetic from env: `--env-file-if-exists`, so builds need no `.env`; runtime config env-only; never bake `.env`.
- The image sets `HOST=0.0.0.0`; local dev stays loopback (`127.0.0.1`).
- CI compiles web and Rust; no image pipeline, no deploy.

## Commands

- `bun run dev` — `apps/web` on Vite (`:3003`); the Rust binaries are separate processes.
- `cd apps/mobile-storefront && bun run dev` / `cd apps/mobile-dashboard && bun run dev` — Expo dev server; `bunx expo run:android` builds a native dev client. The mobile apps are not covered by `bun run dev`.
- `bun run store:build <slug> --platform android|ios` — one EAS production build from `stores.json`; the script refuses a slug that cannot be a package segment.
- `bun run store:update <slug> --message "…"` — one EAS Update for the shared `storefront` channel (every store binary at once).
- `cd packages/api-client && bun run api:generate` — Orval regenerates the clients from the committed OpenAPI documents.
- `cargo run -p api-commerce` / `-p api-tenant` / `-p worker` — one process each. Cargo lives in `~/.cargo/bin`: `export PATH="$HOME/.cargo/bin:$PATH"` in a fresh shell.
- `bun run typecheck` — `bun check` (Bun's built-in TS 7 checker) across workspaces, after `typegen`.
- `cargo test --workspace` / `bun test` — unit tests (no infra).
- `bun run test:integration` — infra-backed checks.
- `bun run build` — typegen then the Vite production build; Rust builds with `cargo build --workspace --release`.
- `bun run lint` / `bun run fmt:check` — oxlint + oxfmt via turbo (`@menuza/*`); Rust uses `cargo clippy --workspace --all-targets -- -D warnings` and `cargo fmt --all --check`.
- `bun run db:migrate` (`cargo sqlx migrate run --source crates/persistence/migrations`) / `db:deploy` (`cargo sqlx prepare --workspace -- --all-targets`) — the sqlx lifecycle.
- `cargo run -p openapi` / `cargo run -p openapi -- --check` — regenerate / drift-check `crates/openapi/{commerce,tenant}.json`.
- `bun run infra:up` / `infra:down` — Postgres + Redis + Jaeger.
- `bunx turbo run <task>` — Turborepo task DAG with local cache (e.g. `turbo run build`, `turbo run typecheck`).

### Lint/format baselines

- Repo-wide `bun run lint` / `bun run fmt:check` go through turbo; check own paths: `bunx oxfmt <paths>` then `bunx oxlint <paths>`.
- `anti-slop/require-readable-spacing` is autofixable (`bunx oxlint --fix <paths>`); re-run formatter + lint, second pass must change nothing.
- Format touched files only; package-wide `bun run fmt` rewrites unrelated files.

## Git hooks

- Husky 9 + lint-staged 17; `prepare: husky` in root `package.json`; `.husky/pre-commit` (plain POSIX, no `husky.sh` sourcing) runs `bunx lint-staged`.
- `.lintstagedrc.json`: staged `*.{ts,tsx,js,jsx,mjs,cjs}` → `bunx oxfmt` then `bunx oxlint --fix`; `*.{json,jsonc,md,css}` → `bunx oxfmt`.
- Hook sees staged files only; CI is the repo-wide gate.
- No `--no-verify` unless the user explicitly asks.
- `.husky/_/` generated + gitignored; `.husky/pre-commit` tracked.

## Definition of done

Run in this order, report each result: `bun run design:check` (dashboard UI only, `apps/web/DESIGN.md`), `bun run typecheck`, `cargo test --workspace`, `bun test`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all --check`, `cargo run -p openapi -- --check`, `bun run lint`, `bun run fmt:check`, `bun run build`.

## Agent rosters

Both harnesses run without a custom agent roster, on purpose.

- **OpenCode** — no project agents: `.opencode/agents/` is gone and `.opencode/opencode.jsonc` sets no `default_agent`. OpenCode uses its built-in `explore` (read-only search) plus `general`, `plan` and `build`.
- **Claude Code** — no `.claude/agents/` either. It uses its built-in `Explore`, `Plan` and `general-purpose` agents.
- If a roster ever comes back, justify it against the built-ins and say what the built-in cannot do.

## Claude Code harness

Parallel to `.opencode/`, which is otherwise untouched. Claude Code reads `AGENTS.md` natively, but the committed `CLAUDE.md` imports it and suppresses automatic nested reads, so `CLAUDE.md` carries the rule to read the nearest nested `AGENTS.md` before editing in a subtree.

- `CLAUDE.md` (root) — `@AGENTS.md` plus Claude-only rules. No agents; see Agent rosters.
- `.claude/settings.json` — `permissions.deny` for `git reset --hard`, `git clean`, `git branch -D`; `enabledMcpjsonServers` for the two committed servers; `plansDirectory: .agents/plans`; the local marketplace and plugin. No `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` — Code Mode cannot run alongside agent teams.
- `.claude/skills` — symlink to `../.agents/skills`. Skills are authored there, not through the link.
- `plugins/.claude-plugin/marketplace.json` + `plugins/menuza-harness/` — first-party plugin carrying two hooks: `SessionStart` injects `.projectmem` context, `PreToolUse` rewrites `Bash` through `tokless rtk-rewrite`. Both no-op without `tokless` or `.projectmem/`. `plugins/**` is lint-exempt and outside every workspace, so it is not type-checked.
- `.mcp.json` (root) — `context-mode` and `projectmem` (`${HOME}/.local/bin/pjm-mcp`), local stdio. `codegraph` is not registered, so the CodeGraph rule below does not apply to Claude Code. `linear`, `context7`, `deepwiki`, `web-search` need credentials and stay user-scope; `.projectmem` context also arrives via the `SessionStart` hook.
- Code Mode is user-scope: Claude Code ignores `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE` in project settings. Set it in the shell or `~/.claude/settings.json`.

## Security

- No secrets in `.env`/tracked files; only `.env.example`.
- Tenant resolution server-side (`proxy.ts` host→mode map); the proxy writes `x-menuza-tenant-id` after resolving the host and drops the client's copy.
- Tenant scope is app-layer: every tenant-scoped query binds `tenant_id`. `TenantScope` accepts the header only from a loopback peer or a trusted proxy hop (`TRUSTED_PROXY_HOPS`, `TRUSTED_PROXY_HOP_IPS` and `x-forwarded-host` together); a forwarded header alone never grants trust.
- Internal calls carry `x-menuza-internal-token`, compared in constant time against `INTERNAL_API_SECRET`; an unset secret fails closed.
- `/mcp` answers only Hosts in `MCP_ALLOWED_HOSTS` (loopback default, never empty and never disabled) and only stores that enabled the integration.
- APIs loopback-bound; the image sets `HOST=0.0.0.0`; production reverse proxy explicitly out of scope for this foundation.
- `VITE_*` and `EXPO_PUBLIC_*` never carry secrets.
- Management endpoints deny-by-default; capability checks run in the handler next to the query they protect.

## Testing

- Bun test runner for TypeScript, `cargo test --workspace` for Rust; both are unit tests needing no infrastructure. No Vitest or Playwright.
- The `.sqlx` offline cache is committed; CI sets `SQLX_OFFLINE=true`, so compile and test need no database.
- Integration tests are labelled separately.
- `scripts/workspace-policy.test.ts` enforces catalog hygiene, internal dep protocol, TS 5/6 absence, and an `AGENTS.md` per workspace and per crate.

## Working agreements

Bias toward caution over speed; trivial tasks use judgment.

### Think before coding

- State assumptions; uncertain? ask.
- Multiple interpretations? Present them, don't pick silently.
- Simpler approach? Say so, push back when warranted.
- Unclear? Stop, name the confusion, ask.

### Flag better options

- User can be wrong. A materially better/cheaper/faster/more accessible alternative (model, provider, service, free tier, algorithm, UI, accessibility) gets the tradeoff and a recommendation; a line or two, not a lecture.
- Don't silently substitute or block: surface it, ask, follow the user's decision.
- Full-autonomous mode: skip the round-trip, take the better option, state the choice.

### Surgical changes

- Touch only what the request requires; no "improving" adjacent code, comments, formatting.
- Don't refactor what isn't broken; match existing style.
- Unrelated dead code: mention it, don't delete it.
- Remove only orphans YOUR changes created (imports/variables/functions).
- Every changed line traces to the request.

### Goal-driven execution

- Task → verifiable goal ("fix bug" → "failing repro, then green").
- Multi-step: plan with a verify check per step; loop until verified.

### Plans

Every non-trivial plan is a file under `.agents/plans/<kebab-task-name>.md`. One board per task; replace an earlier file for the same task instead of adding a second.

- Claude Code and OpenCode both write there — `plansDirectory` in `.claude/settings.json` points at it.
- Do not write `.opencode/plan/`; that is the retired roster's board, kept only as history.
- Step line: `- [ ] S1 <action> | files: <paths> | verify: <command>`. Marks: `[ ]` todo, `[~]` in flight, `[x]` done, `[!]` blocked with a one-line reason.

### Version control

- No `git commit` / `git push` unless the user explicitly asks; completing a task is not permission to commit.
- Don't stage, amend, or "tidy up" the tree; leave it as the user left it.
- Force-push, rebase, `reset --hard`, branch deletion only when asked.

## Anti-patterns

- No empty abstraction packages ("for later").
- No single-consumer packages: one-app code stays in that app (offline queue in `apps/web/src/offline`).
- No middleware/utility micro-packages: shared server middleware/auth lives in `menuza-http` or `domain`, not in `packages/auth-core` / `packages/tenant-context`.
- New packages or crates: explicit justification + `scripts/workspace-policy.test.ts` allowlist entry.
- No factory/config abstraction around a single value.
- No features, flexibility, configurability beyond the ask.
- No error handling for impossible scenarios.
- No shared UI package (one frontend consumer).
- No `tsdown`.
- No SQL outside `crates/persistence`; no `axum` type in `crates/domain`; no IO in `crates/contract`.
- No `ignoreBuildErrors: true`, no silenced compiler checks.

## Code search

- The global `AGENTS.md` CodeGraph rule applies here: `codegraph_explore` before any `read`/`grep`/`glob` for structure, flows, callers, blast radius; treat the result as already read.
- Skip it for a missing/stale index and for non-indexed content (configs, docs, env files); plain tools there.
- Never run `tokless index`.

## Tooling state

- **Turborepo**: local cache only, wraps the `@menuza/*` scripts; no remote cache.
- **Cargo workspace**: six crates, two listening binaries (`:3001`, `:3002`), one River worker and one OpenAPI emit binary; every pre-1.0 dependency pinned with `=`.
- **sqlx**: hand-written SQL in `crates/persistence`, checked at compile time by `query!`/`query_as!`; the committed `.sqlx` cache is what CI builds against (`SQLX_OFFLINE=true`), so no database is needed for a build.
- **River**: `riverqueue` 0.4 over the same Postgres (ADR-0008); three queues (`orders-expiry`, `payment-events`, `push-notifications`), each idempotent, each drained by one module in `crates/worker`. Redis stays in `infra/compose.yaml` with no application consumer.
- **OpenAPI**: `crates/openapi` emits `commerce.json` / `tenant.json`; `--check` fails on drift; orval generates `@menuza/api-client` from them. `/docs` (Scalar) is mounted only when `MENUZA_ENV=development`.
- **Store theme**: `StoreSettings.{primaryColor,accentColor,backgroundColor,radius}` (migration `0008`), resolved by `domain::theme` and served on `PublicStore.theme` and `GET/PUT /panel/stores/{slug}/theme` (`branding:write`). The web storefront writes it as CSS variables; the native app writes the same tokens through Uniwind. Colors are `#rrggbb`; the ink is derived, never saved.
- **Expo apps**: `apps/mobile-storefront` and `apps/mobile-dashboard` share `@menuza/api-client`, `@menuza/shared` and the palette; the storefront resolves its tenant from `applicationId` and the dashboard from the session cookie. Both use TanStack Query persisted in `expo-sqlite`, `expo-router`, and Uniwind; the dashboard's Gestão tab opens the `management/` stack (catálogo, cupons, clientes, auditoria, integrações, configurações). `expo-symbols` backs the Android `md` tab icons. `eas.json` puts each app on its own Update channel (`storefront`, `dashboard`).
- **TanStack Query**: `QueryProvider` in root layout, IndexedDB-persisted; coupons screens first consumers (`useQuery`/`useMutation` in `coupons-table.tsx` / `coupon-form.tsx`); `apps/web/src/offline` queue drains it.
- **Serwist (PWA)**: first-party `serwistWorker()` in `apps/web/vite.config.ts` bundles `src/sw.ts` (Vite lib, iife), injects precache manifest via `@serwist/build`; worker `/serwist/sw.js`; manifest `/manifest.webmanifest`; `OfflineListener` in root route; Background Sync drain wired.
- **Web Push**: VAPID end to end; sender and dispatcher in `crates/worker` (`push_sender.rs`, `push_dispatch.rs`); subscription/preference routes in the `api-tenant` push subdomain; contract `@menuza/shared/push`; `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` in `.env.example`, any empty disables push. No producer enqueues `push-notifications` yet.
- **Sentry**: `@sentry/react`/`@sentry/node` in `apps/web` (client + server); no-op without `SENTRY_DSN`/`VITE_SENTRY_DSN`; never commit a DSN; 10% traces (`SENTRY_TRACES_SAMPLE_RATE`, `0` disables tracing); LGPD lock-down from `@menuza/shared/sentry-privacy` (`dataCollection` off + `beforeSend` scrubber). The Rust binaries log through `tracing` and have no Sentry integration.
- **GitHub Actions**: eleven jobs (`policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`, `rust-fmt`, `rust-clippy`, `rust-test`, `rust-build`, `rust-schema`), SHA-pinned actions, Bun `canary`, `SQLX_OFFLINE=true` for the Rust jobs; no image pipeline, no deploy.

## Agent skills

### Menuza product skill

Product meaning, features, technical decisions and per-change checks live in the `menuza` skill (`.agents/skills/menuza/`); load it for any Menuza feature or `MEN-` ticket.

- Entry `.agents/skills/menuza/SKILL.md` — router (always-true invariants + topic table). Word without a topic: `.agents/skills/menuza/INDEX.md`, flat keyword → file map.
- Each folder/subfolder has an `INDEX.md` keyword table: `product/` (vision, tenancy, MVP scope, open decisions, glossary); `features/` (`stores-and-teams/`, `storefronts/`, `catalog/`, `payments/`, `delivery/`, `orders/`, `customers/`, `notifications/`, `admin/`, `integrations/`); `engineering/` (stack, ADRs, monorepo map, request path, render stages, checks, follow-ups); `tickets/` (Linear queries, roadmap epics, ticket → module map).
- `PRODUCT.md` (root, numbered) and Linear are authoritative; the skill maps them to code. Run `engineering/checks.md` before calling a feature done.

### Skill tiers

Load by tier, never all at once.

- **Tier 0 — always on for UI:** `shadcn` (existing components first, semantic tokens, `FieldGroup`+`Field`, `gap-*` not `space-*`, overlays with `Title`, `Avatar` with `Fallback`) + `menuza` (invariants + checks); dashboard work also follows `apps/web/DESIGN.md`, verified by `bun run design:check`.
- **Tier 1 — checkers on demand:** `better-accessibility` (focus, ARIA, contrast), `better-layout` (responsive, no page-level horizontal overflow); `housekeeping` (probe reality, temporary `FINDINGS.md` board, parallel read-only audits, parallel disjoint-file fixes, full verify chain; never commits or stages), then `dead-code-auditor` (reports only: six categories, evidence-backed, never deletes, ends offering `/plan`) and `ai-slop-cleaner` (task's changed files only; behavior lock + fallback classification, passes 1–4, never masks architectural blockers). All three honour Surgical changes: unrelated dead code mentioned, not deleted.
- **Tier 2 — one generator:** `frontend-design` (product UI) xor `design-taste-frontend` (marketing hero); never both.
- **Tier 3 — never auto-load:** `better-colors`, `better-typography`, `better-ui`, `better-writing`, `better-interface`, `web-design-guidelines`, `vercel-composition-patterns`, `vercel-react-best-practices`, `interface-review`, `explain-interface`, `variant`; name-only, task exactly that slice.
- Backend/tooling skills (`orpc*` for the legacy contracts, `prisma-8` for the historical schema, `next-*`, `install-anti-slop`, `break`) load by task.

### Issue tracker

Issues live in Linear (workspace Menuza, team Menuza) via Linear MCP tools; see `docs/agents/issue-tracker.md`.

**Linear is the only ticket store.** No ticket list, status, priority or inventory mirrored into this repo — not in docs, not in the skill, not in code comments. Cite `MEN-###` to point at the tracker; never record its state locally.

#### Querying Linear correctly

Team selector `team: "Menuza"` (key `MEN`); ids are `MEN-###` strings passed as `id`.

- `list_issues` `fields` is a closed whitelist: `id`, `title`, `status`, `statusType`, `priority`, `estimate`, `labels`, `assignee`, `project`, `parentId`, `createdAt`, `updatedAt`, `completedAt`, `canceledAt`, `url`. `identifier`, `state`, `relations` are **not** fields — `id` already is `MEN-###`; state is `status` (display name) plus `statusType` (`backlog | unstarted | started | completed | canceled | duplicate`).
- `list_issues` **never returns relations**. Blockers: one `get_issue({ id, includeRelations: true })` per issue, under `relations.blockedBy` / `relations.blocks` / `relations.relatedTo`.
- Status names are custom (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`, `Anotações`). Filter on `statusType`, not the name — "Done" is `completed`, not `Completed`.
- `limit` caps at 250, pages via `hasNextPage` + `cursor`. One 250-item team fetch filtered in code beats paging per status/parent.
- Roadmap maps are parent issues — `MEN-63` (MVP), `MEN-64` (post-MVP immediate), `MEN-65` (future); tickets come back via `parentId`.
- **Blocker and ordering live in ticket prose, not relations** — the graph is barely used, so empty `blockedBy` does not mean ready. Read description and `list_comments` before judging what is next; "X must land before Y" is in the body.
- Markdown in `save_comment` / `save_issue` needs real newlines, never escape sequences.

When reporting issues, never cite an identifier alone (`MEN-179`): pair it with the title (or short summary), e.g. `MEN-179 — Next.js 16.4 canary + RSC + Cache Components`. Lists, tables, prose. Identifier first (copy-pasteable), title readable without opening Linear.

### Triage labels

Default five canonical roles used as-is; see `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout; see `docs/agents/domain.md`.
