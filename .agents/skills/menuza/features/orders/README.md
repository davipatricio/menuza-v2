# Orders and coupons

`PRODUCT.md` §15–§16. Tickets: MEN-93 pedidos, MEN-94 reembolso/retry, MEN-97 cupons, MEN-98 ordem de aplicacao, MEN-116..120 (post-MVP ops).

Notifications live in `../notifications/`; customers, exports and KPIs in `../customers/`. Deep references: `lifecycle.md`, `coupons.md`.

## Order lifecycle (`PRODUCT.md` §15)

- States requested: awaiting payment, paid, ready, available for pickup, completed, cancelled, refunded, expired/unpaid. Pay-on-delivery must be identifiable **without blocking fulfilment**.
- **Recommended direction (not the final machine):** separate **financial**, **fulfilment** and **delivery** situations so an order can be ready/completed and not yet paid.
- Online orders accepted automatically after payment; pay-on-delivery enters fulfilment before payment. The store marks receipt per permission. Repeat-order available.
- Open: post-payment edit/cancel/substitution; refund is total only in the MVP. The store is responsible for the sale to the buyer; contractual responsibilities still to formalize.

## Coupons and promotions (`PRODUCT.md` §16)

Fixed or percentage discount; free shipping; first purchase; minimum value; eligible products; global and per-customer use limit; validity; delivery-mode restriction; coupon stacking configurable per coupon; stacking with kits/progressive discounts/free shipping configurable.

**Open (MEN-98):** application order, each discount's base, and precedence when one coupon allows stacking and another forbids it. Totals can never go negative; use limits must survive concurrent purchases.

## Code entry points

- Schema `crates/persistence/migrations/0001_baseline.sql` (`Order`, `Coupon`, `Customer`, `AuditLog`; every table carries `tenantId`, money is `Int` cents), all SQL in `crates/persistence` (`commerce/orders.rs`, `tenant/panel/orders.rs`, `tenant/panel/coupons.rs`).
- Panel API in `crates/api-tenant` (:3002), `crates/api-tenant/src/domains/tenant/subdomains/panel/`: `listPanelOrders`, `getPanelOrder` (by human order code), `listPanelCustomers`, `getPanelCustomer`, `listPanelCoupons`, `listPanelAuditLogs`, `transitionPanelOrder`, `recordPanelOrderPayment`.
- Panel UI under `apps/web/src/routes/dashboard/$storeSlug/{orders,customers,coupons}/` (TanStack file routes); tables are client islands fed rows as props.
- Async work runs in `crates/worker` on River/Postgres (ADR-0008). Only `orders-expiry` has a producer (`persistence::commerce::orders::create` enqueues before commit); `payment-events` and `push-notifications` have no producer yet.

## Checks

- Duplicate payment confirmation adds no duplicate commission/cashback/dispatch. → `../engineering/checks.md` scenario 5.
- A per-customer coupon limit and a controlled-stock decrement both hold under concurrency (`coupons.md`, `../catalog/inventory.md`).
