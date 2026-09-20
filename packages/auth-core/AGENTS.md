# @menuza/auth-core

- Library package. Owns password hashing, sessions, cookie serialization, and auth middlewares.
- Uses native Bun.password argon2id (`memoryCost: 65536`, `timeCost: 3`). No external hash dependencies.
- Session cookies are host-only, opaque (`cuid`/`uuid`), separate per namespace:
  - `menuza_commerce_sid` for buyer/storefront (`namespace: "commerce"`)
  - `menuza_tenant_sid` for manager/dashboard (`namespace: "tenant"`)
- In-memory membership cache with 60s TTL, invalidated on session revocation.
- Middleware order is strictly: `[tenant] -> [auth] -> handler`.
  - For tenant namespace: verifies session + looks up `TenantMembership` for `context.tenantId`. Missing membership throws `FORBIDDEN`.
  - For commerce namespace: verifies session + populates `context.session`.
- Server-only: do NOT import from browser code.
