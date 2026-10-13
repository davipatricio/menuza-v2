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

- Models `Order`, `Coupon`, `Customer`, `AuditLog` (`packages/db`); panel reads `panel.listOrders`, `panel.getOrder` (by human order code), `panel.listCustomers`, `panel.getCustomer`, `panel.listCoupons`, `panel.listAuditLogs`.
- Panel UI under `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/{orders,customers,coupons}/`; tables are client islands fed rows as props.
- Async work (Pix expiry, retries, notification fan-out) runs in `apps/worker` on BullMQ.

## Checks

- Duplicate payment confirmation adds no duplicate commission/cashback/dispatch. → `../engineering/checks.md` scenario 5.
- A per-customer coupon limit and a controlled-stock decrement both hold under concurrency (`coupons.md`, `../catalog/inventory.md`).
