# Inventory and stock

`PRODUCT.md` §8. Tickets: MEN-81 estoque, MEN-83 baixa de componentes.

Stock is per product or variation, controlled or unlimited. The hard requirement: **controlled stock must block overselling**.

## Rules

- Controlled or unlimited, chosen per product/variation. Controlled keeps a real balance and must block overselling; unlimited imposes no artificial balance.
- With variations, define the precedence between product-level and variation-level config (open).
- **Reservation moment is configurable** (options/default open). Reservation, expiry, payment and write-off must together prevent selling the same last unit concurrently.
- The reservation window is **not** automatically the Pix validity window (`../payments/gateways.md`).
- Kits consume the stock of their chosen component variations (`kits.md`).
- No production, capacity, ingredients, lots or operational validity in the MVP. Alerts, labels and reports are open.

## Code entry points

- `Product` / `Variation` stock columns (`packages/db`); the write-off runs in the order-flow path and async jobs in `apps/worker`.
- Concurrency safety comes from the database (transaction/conditional update), not from an in-process cache.

## Checks

- Two concurrent purchases never consume the same last controlled unit. → `../../engineering/checks.md` scenario 3.
- Expiry of a reservation returns the unit to stock exactly once.
