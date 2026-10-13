# Stores and teams

`PRODUCT.md` §3–§4, §20–§21. Tickets: MEN-70..73, MEN-106, MEN-107, MEN-74, MEN-215/216.

A **store** is a tenant. Signup is auto-approved, PF or PJ (CPF/CNPJ), with name, address and phone; the store is switched on by "Loja ativa" and can pause sales manually or by schedule. The **team** is that store's members: predefined roles, per-tenant permission adjustments, and a per-member override.

## What a change here must respect

- Cargo permissions are adjustable **per tenant and per member**; creation of custom roles is out of MVP.
- A permission configured **on the member overrides the role**. Access is confined to tenants the member belongs to.
- Invites are by **link with validity**; no second-user approval gate in the MVP.
- An active "Loja ativa" switch is not a complete publish check — minimal publication validations are still open.
- Support access must be authorized and **audited** operational access, never reading passwords, integration secrets or full card data.

## Code entry points

- Store signup / login / panel: `apps/web/src/app/(dashboard)/dashboard/{login,signup}/*`; session calls go through `apps/web/src/lib/session-client.ts`.
- Team list (read-only): `panel.listTeamMembers` → `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/settings/team/`.
- Capability map: `requireCapability` in `packages/api-tenant/src/domains/panel/support.ts`, using `can` from `@menuza/orpc-server/auth`. `staff` has no `team:read`, so the panel renders the read-only notice on `FORBIDDEN`.
- Contracts: `@menuza/shared/tenant` (`session.*`, `account.*`, `panel.*`).
- Account page (member-level, spans stores): `account.listSessions`, `account.changePassword` (revokes every **other** session), `account.revokeSession`, `account.revokeOtherSessions`.

## Checks

- A member of two tenants sees only the store they addressed; a known resource id from the other tenant is `NOT_FOUND`. → `../engineering/checks.md` scenario 1.
- A member override wins over the role and cannot escalate the caller's own privileges. → scenario 2.
- Notification preferences never exceed the recipient's permissions or tenant. → scenario 11.

See `roles-and-permissions.md` and `audit.md`.
