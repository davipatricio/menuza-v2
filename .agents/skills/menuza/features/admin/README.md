# Menuza admin, support and SaaS billing

`PRODUCT.md` §2, §19, §20, §28. Tickets: MEN-106 admin, MEN-107 suporte auditado, MEN-216 guarda de admin, MEN-110 inadimplencia, MEN-111 comissionamento, MEN-112 planos, MEN-181 Asaas SaaS, MEN-229 permissões.

This is the internal Menuza surface — the platform operator, not a store's panel. It is **deny-by-default** and separated from any tenant's data plane.

## Admin (`PRODUCT.md` §19)

- Internal admin manages tenants, plans, contracts, commissions, integrations, operational status and support.
- **Admin access is a distinct, audited capability**, never a store role (`../stores-and-teams/roles-and-permissions.md`).
- The admin surface is deny-by-default (ADR-0004 spirit): only the intended procedures are exposed, each behind the capability map and guarded by MEN-216.

## Support access (`PRODUCT.md` §20)

- Support may operate a tenant's account only through **authorized, audited** access.
- Support must never read passwords, integration secrets or complete card data (`../stores-and-teams/audit.md`).
- Every support session leaves an audit record with actor, tenant and time.

## SaaS billing (`PRODUCT.md` §2, §28)

- Billed per tenant/restaurant; plans and commission in `../../product/meaning.md`.
- Runs on **Asaas** (recurring card, Pix Automático, boleto). Commission via Asaas split where supported, else manual transfer.
- Distinguish three planes: SaaS subscription (tenant), the buyer's one-off payment (`../payments/`), and future meal recurrence (post-MVP, MEN-150).
- **Inadimplência** (MEN-110): a delinquent tenant is deactivated, deleted at 90 days — but first define notices, export, in-flight orders, legal retention and backup disposal. Deactivation is not authority to stop serving already-accepted orders.

## Code entry points

- Admin/support procedures live on the tenant (management) surface, gated by an internal/admin capability; never exposed anonymously.
- `AuditLog` records support and admin actions (`../stores-and-teams/audit.md`).
- SaaS billing integration: Asaas client in the appropriate API; webhooks drained in `apps/worker` (MEN-181).

## Checks

- Support and admin actions are deny-by-default and audited. → `../engineering/checks.md` scenario 12.
- Deactivation/deletion preserves financial integrity and defined retention. → scenario 12.
