# Roles and permissions

`PRODUCT.md` §4. The matrix is not final — treat the concrete list as provisional and cite the ticket.

## Roles

`Proprietario`, `Administrador`, `Atendimento` (owner / admin / staff). Predefined; no custom roles in the MVP; permissions are adjustable per tenant and per member.

## Rules

- Every protected action requires its authorization. Access is limited to the tenants the user belongs to.
- A **member override wins over the role**.
- No action requires a second user's approval in the MVP.
- Permission areas named: prices, coupons, orders, refunds, financial, customer export, team, integrations.
- Owner-only powers, the initial matrix, invite validity and access revocation are **open** (`../../product/open-decisions.md`).

## Code

- Capability predicate `can` from `@menuza/orpc-server/auth`; the HTTP-facing wrapper is `requireCapability` in `packages/api-tenant/src/domains/panel/support.ts`, which turns a failed check into `FORBIDDEN`.
- Do not hand-roll role checks elsewhere: extend the capability map, keep one source of truth, and keep it server-side.
- `panel.listTeamMembers` is the reference caller: gated on `team:read`, so `staff` is refused and the web renders it as the read-only notice.
- Admin/support access (MEN-107, MEN-216) is a distinct, audited capability — not a role.

## Checks

- A grant never widens beyond the member's own permissions (no self-escalation). → `../engineering/checks.md` scenario 2.
- A capability check is server-side; a UI that hides a control is not the guard.
