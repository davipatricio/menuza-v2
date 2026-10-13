# Auth and sessions

`PRODUCT.md` §3, §5, §26. Tickets: MEN-75 gestores, MEN-76 compradores, MEN-167 auth propria, MEN-213 shared engine, MEN-214/215/216, MEN-226..228 (post-MVP), MEN-225 dashboard auth.

Menuza runs its **own** auth: argon2 password hashing and server-side sessions with revocation. 2FA and social login are out of the MVP.

## Two surfaces, one engine

- **Staff (management)**: `session.login` / `session.logout` / `session.current` / `session.register`, plus the `account.*`, `panel.*` and `profile.*` procedures (`@menuza/shared/tenant`). The cookie is `menuza_tenant_sid`.
- **Buyer (commerce)**: email + password in the MVP, separate from staff identity (MEN-76, MEN-214).
- Both share one session engine with separate namespaces (MEN-213) — do not fork the session implementation per surface.

## Rules

- Sessions are server-side and revocable; cookies are httpOnly + SameSite. Never store a bearer token the client can replay after logout.
- `account.changePassword` and `account.revokeOtherSessions` revoke every **other** session; `account.revokeSession` revokes one.
- The storefront sends a tenant header; the tenant **management** surface never does — every `panel.*` takes `storeSlug` and the server resolves it (ADR-0005, MEN-225).
- An unknown slug and a non-member are both `NOT_FOUND`, so existence never leaks.
- No anonymous management operation beyond the health probe and the VAPID public key (`packages/api-tenant/AGENTS.md`).

## Code entry points

- Session plumbing and `authMiddleware` in `@menuza/orpc-server/auth`; contracts in `@menuza/shared/tenant`; panel/session client in `apps/web/src/lib/session-client.ts`.
- Models `Member`, `MemberIdentity`, `Session`, `TenantMembership` (`packages/db`).

## Checks

- A revoked or foreign session cannot read another tenant's data. → `../engineering/checks.md` scenario 1.
- Logout and password change invalidate the expected sessions and no others.
