# #0006 Cancel/refund transitions skip wallet reserve release, stock return, cashback reversal

- 2026-11-17T22:09:21Z `issue`: Cancel/refund transitions skip wallet reserve release, stock return, cashback reversal [crates/persistence/src/commerce/orders.rs:429]
- 2026-11-17T22:09:21Z `issue`: mark_paid accepts expired/canceled/refunded orders; expired→paid double-credits wallet [crates/persistence/src/commerce/orders.rs:2068]
- 2026-11-17T22:09:21Z `issue`: Payment event with NULL amount_cents pays order without amount check [crates/persistence/src/commerce/payments.rs:185]
- 2026-11-17T22:09:21Z `issue`: Product-only order lines keep client unit_price_cents; discount and shipping also client-trusted [crates/persistence/src/commerce/orders.rs:1220]
- 2026-11-17T22:09:21Z `issue`: No rate limiter on /session/login or /oauth/token; RateLimited unused [crates/http]
- 2026-11-17T23:47:42Z `fix`: Track 4/5 UI, a11y, floor-rounding parity and dead-code cleanup: Math.floor kit discounts across web/mobile, KitComposer group/output/live-region semantics, pendingComponent on orders/customers/audit, mobile a11y roles/labels, deleted 5 orphan modules and unused mobile catalog/feedback exports [apps/web/src/features/catalog/lib/kit-price.ts]
