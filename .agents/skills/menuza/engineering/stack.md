# Stack and architecture

`PRODUCT.md` §26–§27, ADRs in `docs/adr/`. Decisions here are closed with the founder; a change needs a new round.

## Shape

| Layer         | Choice                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Bun (`bun check` for TS 7 type checking) for `apps/web`; Rust 1.95.0 on `rust-toolchain.toml` for the six crates. TypeScript 7 only, no TS 5/6                                                                                                                             |
| Contracts     | OpenAPI documents emitted by `crates/openapi` (utoipa 6) and consumed by orval; the Valibot/oRPC contracts left in `packages/shared` are legacy                                                                                                                            |
| Data          | sqlx 0.9 over Postgres, hand-written SQL in `crates/persistence`; app-layer tenant scope (ADR-0001), no RLS in this cut                                                                                                                                                    |
| Web           | TanStack Start 1.169 in `apps/web` — Start + Router + Query on Vite, three pathless route groups                                                                                                                                                                           |
| UI            | shadcn/ui on Base UI (not Radix); Tailwind 4. Dashboard visual system, tokens and component recipes: `apps/web/DESIGN.md`                                                                                                                                                  |
| Auth          | Own: argon2id in `crates/domain`, server-side sessions with revocation, httpOnly + SameSite cookies. 2FA/social out of MVP                                                                                                                                                 |
| Queues        | River 0.4 on the same Postgres (ADR-0008): `orders-expiry`, `payment-events`, `push-notifications`. Redis has no application consumer                                                                                                                                      |
| Storage       | S3-compatible (R2/B2) + Cloudflare CDN, signed per-tenant URLs                                                                                                                                                                                                             |
| Email         | SMTP self-hosted behind a `Mailer` interface (SES swap later); SPF/DKIM/DMARC required                                                                                                                                                                                     |
| SaaS billing  | Asaas (recurring, Pix Automático, boleto); commission via split or manual transfer                                                                                                                                                                                         |
| Observability | `tracing` structured logs in the Rust services (JSON in production); Sentry on the web only; OpenTelemetry not wired yet (MEN-169); business audit in a dedicated table (not only logs)                                                                                    |
| Hosting       | VPS (Hetzner/Contabo); Postgres on its own VPS with a read replica; Caddy reverse proxy                                                                                                                                                                                    |
| CI/CD         | GitHub Actions: `policy`, `typecheck`, `test`, `lint`, `fmt-check`, `build`, `rust-fmt`, `rust-clippy`, `rust-test`, `rust-build`, `rust-schema`; actions pinned by SHA, Bun from the moving `canary` channel, `SQLX_OFFLINE=true` for Rust (no image pipeline, no deploy) |

## Repo map

Workspace map, dependency direction and where a change belongs: `monorepo.md`. In one line: one TanStack Start app (`apps/web`), two Rust binaries (`crates/api-commerce` on `:3001`, `crates/api-tenant` on `:3002`), one River worker (`crates/worker`), the shared crates (`contract`, `domain`, `persistence`, `menuza-http`), the OpenAPI emit binary (`crates/openapi`), and two TypeScript packages — `packages/shared` (browser-safe types) and `packages/db` (historical Prisma contract and migration history).

## Architecture decisions (`docs/adr/`)

- ADR-0001 single-schema tenant isolation
- ADR-0002 contract-first split commerce/tenant (superseded by ADR-0007 where it describes oRPC)
- ADR-0003 single app, host-aware shells
- ADR-0004 foundation error/auth/sessions (superseded by ADR-0007 where it describes the Bun API layer)
- ADR-0005 surfaces by path and store slug
- ADR-0006 integer cents, not decimal
- ADR-0007 two Rust services behind one OpenAPI contract
- ADR-0008 Postgres is the job store

## Dashboard assistant (Komi)

- Komi is the dashboard's AI assistant and it is **mock-only**: canned pt-BR replies from an in-memory adapter. No backend, no network call, no env var.
- Mounted once in `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx`, as the last child of `<SidebarProvider>`, so it covers every `/dashboard/[storeSlug]/*` page and nothing else — not `/dashboard`, login, signup, the storefront or marketing.
- `apps/web/src/components/assistant-ui/komi-assistant.tsx` is the first-party wrapper (`AssistantRuntimeProvider` + `useRemoteThreadListRuntime`); everything under `apps/web/src/components/assistant-ui/elements/**` is vendored registry code.
- Vendored from `https://r.assistant-ui.com/styles/base-nova/assistant-modal.json` and its `registryDependencies`. **Base UI flavor only** — the `new-york` flavor of the same element imports `radix-ui`, which is banned here.
- Deps are local to `apps/web` (single consumer, not catalog): `@assistant-ui/react` 0.15.31, `@assistant-ui/react-markdown` 0.14.24, `remark-gfm` 4.0.1, `tw-shimmer` 0.4.14, `zustand` 5.0.16.
- Detailed rules — mount point, upstream deltas to preserve when re-vendoring, controls that stay hidden, lint overrides: `apps/web/AGENTS.md` and `apps/web/src/components/AGENTS.md`.
- A real provider is not wired: conversation state is memory-only, so a reload resets the thread.

## Technical pendencies (`PRODUCT.md` §27)

Keep the `.sqlx` cache in step with every query and protect the deploy-time migration lock; retire the legacy oRPC/Valibot contracts from `packages/shared` and settle route versioning on the OpenAPI surface; `Mailer` interface with SMTP driver + SES stub; log/trace/audit retention for LGPD; DR for a single VPS (snapshots, tested restore); VPS monitoring (CPU/RAM/disk/River queues) with basic alerts; and the unported producers below.

Foundation and platform work is tracked in Linear (team `Menuza`) — query it for what is open; no ticket list is kept here. The stack table above is what is locked. Querying rules: `../tickets/README.md`.
