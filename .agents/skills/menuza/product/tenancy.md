# Tenancy

`PRODUCT.md` §3; ADR-0001. This is the load-bearing rule of the whole codebase.

- A restaurant is a **`Tenant`**. A person is a **`Member`** with a **`MemberIdentity`** (credentials); membership and role per tenant are **`TenantMembership`**. One user can belong to several tenants with different roles.
- No mandatory "Company" entity above users. Each tenant owns its catalog, stock, team, settings, subscription and storefront.
- No commercial data is shared across tenants. A cart and an order belong to a single tenant. The buyer arrives at the store's URL; there is no global directory.
- **One delivery base per tenant** in the MVP; addresses are commercial, base, and pickup point (pickup-point count open).
- Store signup is auto-approved; PF or PJ (CPF or CNPJ). A store pauses sales manually or by schedule; a "Loja ativa" switch turns it on, with publication validations still to define.
- Isolation spans queries, files, exports, invites, integrations and admin actions. **Knowing a resource ID grants no access** — resource lookups are always scoped (MEN-69, MEN-180).

## Where isolation is enforced

- Schema: one Postgres schema, **no Row-Level Security**. Isolation is by `tenantId` on every business table plus an application guard (ADR-0001).
- Runtime scope: `TenantScope` (`crates/http/src/extract.rs`) accepts `x-menuza-tenant-id` only from a loopback peer or a trusted proxy hop, then hands the resolved tenant to the handler. Deliberately global reads (storefront host resolution) use the explicit `Scope::unscoped` exception in `crates/persistence/src/tenant.rs`.
- No RLS and no Prisma middleware: isolation is fail-closed by construction — every tenant-scoped statement in `crates/persistence` binds `tenantId` through its scoped helper.
- Auth/sessions: `crates/domain/src/{password,session}.rs` (argon2, cookie, token digest) plus the routes in `crates/api-tenant/src/domains/tenant/subdomains/{account,session}`; there is no `authMiddleware`.
- Management surface: every `panel.*` takes `storeSlug` (never a tenant header); the server resolves slug → tenant, checks membership, and returns `NOT_FOUND` for both an unknown slug and a non-member, without leaking existence (MEN-225).
- Storefront host → tenant: `GET /internal/resolve-host` in `crates/api-tenant/src/domains/tenant/subdomains/internal/resolve_host.rs`, gated by `x-menuza-internal-token` against `INTERNAL_API_SECRET`; `apps/web` never reads the `Domain` table directly (ADR-0005).

Commerce domain tables (all carry `tenantId` + a `tenantId` index): `Category`, `Product`, `Variation`, `Kit`, `KitItem`, `Customer`, `Order`, `Coupon`, `AuditLog`, `MealSubscription`. Identity tables: `Tenant`, `Domain`, `Member`, `MemberIdentity`, `Session`, `TenantMembership`, `PushSubscription`, `PushPreference`, `MemberOnboarding`.
