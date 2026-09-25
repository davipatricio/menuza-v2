# @menuza/auth-core

- Library package. Owns password hashing, sessions, cookie serialization, and auth middlewares.
- Uses native Bun.password argon2id (`memoryCost: 65536`, `timeCost: 3`). No external hash dependencies.
- Session cookies are host-only and separate per namespace. The persisted row key
  is `SHA-256(token)` and the cookie carries the raw token, which is never persisted:
  - `menuza_commerce_sid` for buyer/storefront (`namespace: "commerce"`)
  - `menuza_tenant_sid` for manager/dashboard (`namespace: "tenant"`)
- Cookie `Secure` defaults on, with an explicit `secure: false` opt-out for local
  HTTP. A caller clearing the cookie must pass the same `secure` value it used to
  set it.
- `isSameOriginRequest(options)` is the pure Origin/Referer check for state-changing
  auth requests; it fails closed.
- A session dies on whichever comes first: the absolute 7d cap
  (`DEFAULT_SESSION_TTL_SECONDS`, stored in `expiresAt`) or 24h of idle
  (`DEFAULT_IDLE_TTL_SECONDS`, tracked in `lastUsedAt`). `getSession` slides
  `lastUsedAt` forward only when the last use is at or past
  `LAST_USED_REFRESH_INTERVAL_SECONDS` (5m), so a lost refresh costs at most one
  refresh interval and authenticated requests do not each pay a session write.
- `verifyPassword` fails closed on a null `passwordHash` (bot accounts and future
  Google-only accounts have no password) — never a match, never a crash.
- Roles are the closed set `owner | admin | staff` (`TENANT_ROLES`, `isTenantRole`)
  and grants are `resource:action` capabilities (`TENANT_CAPABILITIES`, `can`):
  owner → all; admin → all except `team:write`; staff → `dashboard:read`,
  `orders:read`, `orders:write`. The vocabulary is for MEN-229 scopes; nothing
  enforces it yet. `Member.kind` is `human | bot` (`isMemberKind`).
- In-memory membership cache with 60s TTL, invalidated on session revocation.
- Middleware order is strictly: `[tenant] -> [auth] -> handler`.
  - For tenant namespace: verifies session + looks up `TenantMembership` for `context.tenantId`. Missing membership throws `FORBIDDEN`.
  - For commerce namespace: verifies session + populates `context.session`.
- Server-only: do NOT import from browser code.
