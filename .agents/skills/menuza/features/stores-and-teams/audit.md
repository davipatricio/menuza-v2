# Audit

`PRODUCT.md` §4, §21. Tickets: MEN-74 (event catalog + retention), MEN-108 (LGPD), MEN-107 (support access).

Every relevant action is audited. The catalog and its retention are **not yet defined** — `AuditLog.action` is free text until MEN-74 closes it.

## What a record must carry

Actor, tenant, action, and moment. Never passwords, partner credentials, or complete payment data.

## Coverage to grow toward

Administrative changes, permissions, orders, payments, wallet, stock, exports and support access. Financial movements (wallet balance changes) must not be silent edits — they need a registered history (`../payments/README.md`, MEN-96).

## Code

- Model `AuditLog` (`packages/db`, tenant-scoped, `@@index([tenantId])`).
- Read path `panel.listAuditLogs` → `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/audit/`.
- Audit is a dedicated table, not only logs (`../engineering/stack.md`).

## Checks

- A permission change, a wallet adjustment and a support-access session each leave an audit record with actor, tenant and time.
- Retention and disposal follow `MEN-108`; do not assume a retention window before it is defined.
