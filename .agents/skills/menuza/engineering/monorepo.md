# Monorepo

Bun workspaces (`apps/*`, `packages/*`) under one repo, one lockfile (`bun.lock`), one catalog. Internal packages use `workspace:*`; external deps shared by ≥2 workspaces sit in the root `workspaces.catalog` and are consumed via `catalog:`. CI installs with `bun install --frozen-lockfile`.

## Workspaces (what actually exists)

| Path | Package | Kind |
| --- | --- | --- |
| `apps/web` | `@menuza/web` | Next 16 app — marketing + dashboard + storefront |
| `apps/commerce` | `@menuza/commerce` | `Bun.serve` shell for the commerce API |
| `apps/tenant` | `@menuza/tenant` | `Bun.serve` shell for the tenant (management) API |
| `apps/worker` | `@menuza/worker` | single BullMQ worker process |
| `apps/orpc-server` | `@menuza/orpc-server` | **library** app — no process, no port |
| `packages/api-commerce` | `@menuza/api-commerce` | commerce router implementations |
| `packages/api-tenant` | `@menuza/api-tenant` | tenant (management) router implementations |
| `packages/db` | `@menuza/db` | Prisma 8 contract, migrations, client, tenant scope |
| `packages/shared` | `@menuza/shared` | browser-safe contracts (Valibot + oRPC) |

The offline queue lives in `apps/web/src/offline`, not in a package. The root `AGENTS.md` anti-patterns name `auth-core`, `tenant-context` and `offline` only as packages **not** to create.

## Dependency direction

```
@menuza/shared        (leaf: no server-only, no env, no db)
      ▲
@menuza/api-commerce  @menuza/api-tenant   ──►  @menuza/orpc-server, @menuza/db
      ▲
apps/commerce  apps/tenant  (Bun.serve)
      ▲  (HTTP, internal rewrite)
apps/web  ──►  /commerce, /tenant
apps/worker  ──►  @menuza/db, Redis/BullMQ
```

Hard rules (root `AGENTS.md`, workspace-policy test):

- `packages/shared` is browser-safe: **no** server-only imports, env reads, or db access.
- `packages/api-*` are server-only: never import from `apps/web` or client code.
- `apps/web` **never** imports `@menuza/db`, Prisma or `@menuza/orpc-server`, and never reads the database — every read goes over HTTP to `apps/commerce`/`apps/tenant`.
- Middleware/auth are **not** separate packages — they live in `@menuza/orpc-server/*`.
- No shared UI package (one frontend consumer, `apps/web`).
- New packages need explicit justification and an entry in `scripts/workspace-policy.test.ts`.

## Where does a change belong?

| Change | Home |
| --- | --- |
| A request/response shape, error code, or route metadata | `packages/shared` (contract; change contract → server, never the reverse) |
| A procedure implementation | `packages/api-commerce` or `packages/api-tenant`, `domains/<domain>/subdomains/<subdomain>/<name>.impl.ts` |
| Middleware, auth/session, OTel, Sentry, RPC/openapi fetch | `apps/orpc-server` (subpaths `/fetch`, `/tenant`, `/auth`, `/internal`) |
| Schema, migration, query scope | `packages/db` (`contract.prisma`, `migrations/`, `src/scope`) |
| UI, route, host routing, cookie forwarding | `apps/web` |
| Process wiring, health probes, shutdown | `apps/commerce` / `apps/tenant` |
| Async job (Pix expiry, retries, fan-out, exports) | `apps/worker` |

Business logic used by only one app lives **in that app**, not in a new package.

## Scripts and tooling

- Root scripts (root `package.json`): `dev`, `build`, `typecheck`, `test`, `test:integration`, `lint`, `fmt:check`, `db:generate`/`db:migrate`/`db:deploy`, `infra:up`/`infra:down`, `docker:build`.
- Turborepo wraps `build`/`typecheck`/`lint`/`fmt` across `@menuza/*` with a local cache (no remote cache).
- Builds go through `scripts/docker-build.ts <app>`: `turbo prune <app> --docker` into `.turbo/prune/<app>`, then the app's `Containerfile` with that pruned dir as context. Bun services compile to a single binary (`--compile --bytecode --format=esm`); web ships Next `output: "standalone"`.
- `bun run typecheck` runs `bun check` after `db:generate` + `typegen`; the build job also compiles the API/worker binaries.

## Checks

- `scripts/workspace-policy.test.ts` enforces catalog hygiene, `workspace:*` protocol, TS 5/6 absence, and per-workspace `AGENTS.md` coverage. Add a package or move a dep → this test is the guard.
- Keep the workspace list above true: an empty `packages/<name>` with a `package.json` silently becomes a workspace.
