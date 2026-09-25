# Foundation: error contract, tenant context, multi-tenant auth sessions

Three orthogonal concerns locked in one place because they share the same lifecycle (foundation, blocks every feature):

**Errors.** A global catalog in `@menuza/shared/errors` defines the closed set of RPC error codes both APIs return (`TENANT_NOT_RESOLVED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL`). Each app extends with service-specific codes. Envelope is the oRPC default `{ code, message, data }`, messages in PT-BR (single locale, matches the glossary). 4xx codes emit a structured log line only; 5xx codes additionally capture to Sentry with tags `service` and `requestId`. Reversing the Sentry split requires re-labelling every existing incident, so we record it.

**Tenant context.** A new library `@menuza/tenant-context` exposes `tenantMiddleware({ require })` and the type `TenantContext`. `apps/web/src/proxy.ts` resolves `host → tenantId` via `Domain`/`Tenant` in Postgres and injects `x-menuza-tenant-id`; the middleware reads only this header (never trust the client). `require: "tenant"` narrows `context.tenantId: string`; `require: "optional"` keeps it `string | undefined`. Missing or unknown tenant throws `TENANT_NOT_RESOLVED`. ADR-0003 already fixed host-based resolution; this ADR pins the consumer side.

**Auth + sessions.** `@menuza/auth-core` library owns hash (Bun.password argon2id, mem=65536 KiB, time=3), session cookie (opaque `sessionId` cuid, `httpOnly`+`Secure`+`SameSite=Lax`), and a TTL'd in-memory membership cache (60s, evicted on revoke). Sessions are member-scoped (one session carries all tenants the member belongs to), resolved against `tenant_memberships(memberId, tenantId, role)`. Two namespaces (`commerce.sessions` for buyers, `tenant.sessions` for managers) share the core; a session never crosses namespaces. Middleware order is `[tenant] → [auth] → handler`. Invite flow is out of scope (consumed by MEN-70).

## Consequences

- Every procedure touching a tenant-scoped table gets `tenantId` from `context`, not from the payload. ADR-0001's manual-filter convention becomes mechanically enforced.
- A buyer with no `commerce.sessions` row hits `tenant.public.health` fine; any commerce-authenticated procedure returns `UNAUTHORIZED`. Manager-side mirror.
- Switching stores is a UI concern deferred to its own card; the API already supports it via `session.switchTenant` (planned, not built here).
- `Cache<Map>` is per-process. Multi-instance deploy invalidates via `tenant_memberships.updatedAt` bump + Sentry warn until a shared cache (Redis) is wired.

## Alternatives rejected

- **Per-tenant sessions** (one session per member per tenant): rejected because the card model is multi-store from day one; forcing re-login per store breaks the dashboard flow.
- **Cookies carrying membership list**: rejected because revoking one store mid-session would require either session rotation or stale-list toleration — both worse than a DB lookup.
- **Schema-per-tenant Postgres isolation**: rejected by ADR-0001; preserved here by reference.

## Amendment — 2026-09-22

Session tokens are now hashed at rest: the persisted row key is `SHA-256(token)` and the
cookie carries the raw token, so a database dump yields no usable session. The cookie
`Secure` flag is now conditional but secure by default, with an explicit `secure: false`
opt-out for local HTTP; a caller clearing the cookie must pass the same `secure` value it
used to set it. `isSameOriginRequest(options)` was added as the pure Origin/Referer check
for state-changing auth requests, failing closed. Session rows written before this change
hold raw ids and are therefore unusable — lookups hash the presented token first, so those
rows simply miss and the change fails closed. The decision text above is preserved as
originally recorded.
