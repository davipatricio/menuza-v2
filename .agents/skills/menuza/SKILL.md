---
name: menuza
description: >
  Menuza's product meaning, features, technical decisions, and the checks every
  change must pass. Use when building or changing any Menuza feature — stores and
  teams, storefronts, catalog and kits, checkout and payments, wallet and cashback,
  delivery and freight, orders and notifications, or integrations — when a task
  cites a MEN- ticket or PRODUCT.md, or when deciding where a change belongs across
  apps/web, apps/commerce, apps/tenant, and packages/*.
---

# Menuza

Multi-tenant SaaS giving each food store (`loja`) its own ecommerce: storefront, catalog, checkout, payments, delivery, and a management panel. Not a marketplace, and no global store directory for buyers. Node + Bun; oRPC contracts; Prisma 8; Next 16 in `apps/web`.

Two sources of truth: `PRODUCT.md` (product, numbered sections) and Linear (team `Menuza`, ids `MEN-###`; `MEN-63` = MVP, `MEN-64` = post-MVP backlog, `MEN-65` = future). This skill maps those onto the code and the checks. It does not replace either — cite the section or ticket when a rule matters.

## Navigate

Load only the file the task needs. Every folder has an `INDEX.md` with a keyword table; `INDEX.md` at this root is the flat keyword map when you only know a word, not a topic.

| Topic | Open |
| --- | --- |
| Vision, who pays, plans, commission | `product/meaning.md` |
| Tenants, users, isolation | `product/tenancy.md` |
| What is in and out of the MVP | `product/scope.md` |
| Unresolved decisions | `product/open-decisions.md` |
| Term ↔ code entity | `product/glossary.md` |
| Store, team, roles, auth, audit | `features/stores-and-teams/README.md` |
| Buyer experience, theming, PWA | `features/storefronts/README.md` |
| Products, variations, complements, kits, stock | `features/catalog/README.md` |
| Checkout, gateways, wallet, cashback | `features/payments/README.md` |
| Coverage, freight, dispatch, scheduling | `features/delivery/README.md` |
| Order lifecycle, coupons | `features/orders/README.md` |
| Customers, exports, KPIs, marketing | `features/customers/README.md` |
| Panel, email, push notifications | `features/notifications/README.md` |
| Internal admin, support, SaaS billing | `features/admin/README.md` |
| Partner integrations | `features/integrations/README.md` |
| Stack and architecture decisions | `engineering/stack.md` |
| Schema migrations and contract changes | `engineering/schema-migrations.md` |
| Dashboard visual system (tokens, recipes, money entry) | `apps/web/DESIGN.md` |
| Monorepo workspaces, placement | `engineering/monorepo.md` |
| Backend request path, middleware, worker | `engineering/backend.md` |
| Route rendering stages in apps/web | `engineering/route-stages.md` |
| The checks a change must pass | `engineering/checks.md` |
| Open technical follow-ups | `engineering/followups.md` |
| Linear: querying, roadmap epics, module map | `tickets/README.md` |

## Invariants

Every change holds these, whatever the feature:

- **Tenant isolation is server-side and fail-closed.** Every tenant-scoped query carries an explicit `where.tenantId`; a known resource ID never grants cross-tenant access. Scope is `withTenant` / `unscoped` from `@menuza/db/scope`; the enforcement points are the oRPC tenant middleware and the Prisma runtime middleware (ADR-0001; MEN-180, MEN-69).
- **Contracts first.** Shapes live in `@menuza/shared/commerce` and `@menuza/shared/tenant` (Valibot, Standard Schema); implementations consume them (ADR-0002). Change contract → server, never the reverse.
- **`apps/web` never reads the database.** It calls `apps/commerce` / `apps/tenant` over oRPC with a member session or the internal token. See `apps/web/AGENTS.md`.
- **Money is validated on the server and stored as integer cents.** `formatBrl` takes cents (ADR-0006); authorization and amounts are never trusted from the client.
- **Retrieval keeps its home.** Commerce procedures in `@menuza/api-commerce`, management in `@menuza/api-tenant`, each with the `domains/<domain>/subdomains/<subdomain>/<name>.impl.ts` layout its AGENTS.md defines.
- **`pt-BR` is the user-facing language.** ASCII slugs live in code; translated labels only in the UI (`src/lib/panel-labels.ts` in the panel).
- **No secret reaches the client.** Per-tenant credentials are encrypted at rest; `NEXT_PUBLIC_*` carries none.

Finish a feature by running `engineering/checks.md`.
