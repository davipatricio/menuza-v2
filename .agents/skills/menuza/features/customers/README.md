# Customers, marketing, metrics

`PRODUCT.md` §18, §21. Tickets: MEN-103 exportacoes, MEN-104 favoritos, MEN-105 avaliacoes, MEN-102 KPIs, MEN-108/109 privacidade, MEN-152/154 (post-MVP).

The store's relationship with its own buyers: the customer record, favorites and reviews, exports, the dashboard KPIs, and the ethics/privacy of using that data. Menuza owns no buyer relationship across tenants.

## Customer record

- A `Customer` is per tenant. A person who buys at two stores is two customers; a **wallet balance never crosses tenants** (`../payments/README.md`).
- Management is in the MVP; the customer file holds contact and purchase history, gated by permission.
- Guest checkout (default on) still produces a customer/contact for communicating the order, with minimal logs and marketing consent kept separate (`../payments/README.md`).

## Favorites and reviews

- Favorites are in the MVP (MEN-104).
- Reviews are **product reviews only** — not store reviews. Whether they are shown, and the nutritional info display, is store-configurable, subject to applicable duties (`../catalog/README.md`, MEN-105).

## Exports and KPIs

- MVP exports: orders, customers, birthdays (MEN-103). Field list and formats are open; exports are tenant-scoped and audited.
- KPIs the store wants: sales, average ticket, margin, reorder, conversion, top products, coupon use, punctuality, cancellations (MEN-102).
- **A KPI is only shown when its collection is defined** — margin needs cost data, punctuality needs real timestamps, conversion needs a session/funnel definition. Never present a derived estimate as a measured metric.

## Privacy and marketing

- LGPD: defined roles, retention and data-subject rights (`../../product/open-decisions.md`, MEN-108). Birthdate is founder-mandated but not LGPD-required — gate on a legal basis (MEN-109).
- Marketing automation (cart recovery, WhatsApp) is post-MVP (MEN-154, MEN-153) and needs a legal basis before it ships. AI reports are post-MVP (MEN-152).

## Code entry points

- `Customer` model (`packages/db`, tenant-scoped). Panel reads `panel.listCustomers`, `panel.getCustomer`; exports run as jobs in `apps/worker`.
- Dashboard UI: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/customers/` and the store home KPIs.

## Checks

- An export contains only the tenant's customers and leaves an audit record. → `../engineering/checks.md` scenario 12.
- No KPI is surfaced without its source events (`../orders/`, `../payments/`).
