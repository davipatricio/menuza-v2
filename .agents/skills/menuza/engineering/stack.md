# Stack and architecture

`PRODUCT.md` §26–§27, ADRs in `docs/adr/`. Decisions here are closed with the founder; a change needs a new round.

## Shape

| Layer | Choice |
| --- | --- |
| Runtime | Bun. TypeScript 7 only. |
| Contracts | oRPC (typed contracts, exportable OpenAPI, streaming, compression) |
| ORM | Prisma 8 + Prisma Migrate; `@prisma/orm-postgres` (ships its own `pg` binding) |
| Web | Next 16 in `apps/web` — Server Components, RSC, Cache Components, partial prefetching, App Shell |
| UI | shadcn/ui on Base UI (not Radix); Tailwind 4 |
| Auth | Own: argon2, server-side sessions with revocation, httpOnly + SameSite cookies. 2FA/social out of MVP |
| Queues/cache | Redis for cache + BullMQ. Scheduled jobs for Pix expiry, retries, async notifications |
| Storage | S3-compatible (R2/B2) + Cloudflare CDN, signed per-tenant URLs |
| Email | SMTP self-hosted behind a `Mailer` interface (SES swap later); SPF/DKIM/DMARC required |
| SaaS billing | Asaas (recurring, Pix Automático, boleto); commission via split or manual transfer |
| Observability | OpenTelemetry traces; Sentry (web + api); Pino structured logs (planned, MEN-169 — today it is the tiny logger in `@menuza/orpc-server`); business audit in a dedicated table (not only logs) |
| Hosting | VPS (Hetzner/Contabo); Postgres on its own VPS with a read replica; Caddy reverse proxy |
| CI/CD | GitHub Actions: install, policy, typecheck, test, lint, build (no image pipeline, no deploy) |

## Repo map

Workspace map, dependency direction and where a change belongs: `monorepo.md`. In one line: one Next app (`apps/web`), two `Bun.serve` API shells (`apps/commerce`, `apps/tenant`), one BullMQ worker (`apps/worker`), a library app (`apps/orpc-server`) and a browser-safe contract package (`packages/shared`), with the routers (`packages/api-commerce`, `packages/api-tenant`) and the Prisma contract (`packages/db`) behind them.

## Architecture decisions (`docs/adr/`)

- ADR-0001 single-schema tenant isolation
- ADR-0002 contract-first split commerce/tenant
- ADR-0003 single app, host-aware shells
- ADR-0004 foundation error/auth/sessions
- ADR-0005 surfaces by path and store slug
- ADR-0006 integer cents, not decimal

## Technical pendencies (`PRODUCT.md` §27)

Prisma on the Bun runtime in production; Postgres adapter and connection impact; oRPC contract format (procedures vs streamable) and route versioning; `Mailer` interface with SMTP driver + SES stub; migration lock in production; log/trace/audit retention for LGPD; DR for a single VPS (snapshots, tested restore); VPS monitoring (CPU/RAM/disk/BullMQ) with basic alerts.

Foundation tickets (standalone): MEN-160 VPS, MEN-161 Caddy, MEN-162 Postgres + replica, MEN-163 Compose, MEN-164 Redis, MEN-166 Prisma, MEN-167 auth, MEN-168 idempotent webhooks, MEN-169 Pino, MEN-170 OTel, MEN-171 Sentry, MEN-172 BullMQ, MEN-173 storage, MEN-174 Mailer, MEN-175 feature flags, MEN-180 isolation, MEN-181 Asaas SaaS, MEN-182 CEP/geocode, MEN-183 Spoke.
