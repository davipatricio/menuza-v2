# Follow-ups

Open work that is not a feature decision. **This is a snapshot; Linear is authoritative** — re-query team `Menuza` before relying on a status here.

## Product gates

The high-priority decisions in `../product/open-decisions.md` block detailed design of billing, gateways, wallet, stock reservation, scheduling, the order state machine, privacy and permissions. Surface the gap; do not invent an answer.

## Technical pendencies (`PRODUCT.md` §27)

- Validate Prisma on the Bun runtime in production; decide the Postgres adapter and its connection impact.
- Define the oRPC contract format (procedures vs streamable) and route-versioning strategy.
- Implement the `Mailer` interface with an SMTP driver and a SES stub.
- Migration lock for production (Prisma Migrate + advisory lock).
- Log, trace and audit retention/disposal policy (LGPD).
- Disaster recovery for a single VPS: snapshots plus a tested restore.
- VPS monitoring (CPU, RAM, disk, BullMQ) with basic alerts.

## Backlog tickets (not yet done)

Infra: MEN-160 VPS, MEN-161 Caddy TLS, MEN-162 Postgres + replica, MEN-163 Compose, MEN-164 Redis, MEN-172 BullMQ, MEN-184 VPS monitoring, MEN-211 Caddy split routes, MEN-222 Prisma deploy + per-tenant seeders.
Platform: MEN-198 typed env (t3-env), MEN-199 Redis rate-limit, MEN-175/203 feature flags, MEN-219 shared cache prefixes, MEN-201 revalidateTag + cache components, MEN-200 orpc cache-invalidation links, MEN-189 OpenAPI export, MEN-188 streaming procedures, MEN-221 TanStack Query SSR, MEN-190 SSR-first (Done), MEN-193 TanStack Form + Valibot, MEN-195 offline-first panel, MEN-197 web-push (In Progress), MEN-223 API Sentry source maps, MEN-204 e2e tests, MEN-202 browser targets, MEN-210 subdomain routing (Done), MEN-213 shared session engine (Done).
Auth/access: MEN-214 buyer auth, MEN-215 manager auth, MEN-216 admin guard, MEN-226 Google OAuth, MEN-227 OTP email/SMS, MEN-228 service accounts, MEN-229 third-party OAuth + per-store/account permissions.

## Recently closed (Do not redo)

MEN-165 orpc contracts, MEN-167 auth + argon2 + sessions, MEN-180 tenant isolation, MEN-179 Next 16.4 + Cache Components, MEN-185..187 orpc server/error, MEN-192 TanStack Table, MEN-194/220 Serwist PWA, MEN-196 offline queue, MEN-205/206/207/208/209/212 monorepo + APIs + worker, MEN-210 subdomain routing, MEN-170/171 OTel + Sentry, MEN-176 CI, MEN-178 bun test, MEN-224/225 dashboard + auth, MEN-109 birthdate (LGPD-gated).
