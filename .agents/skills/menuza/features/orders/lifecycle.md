# Order lifecycle

`PRODUCT.md` §15. Tickets: MEN-93 maquina de estados, MEN-94 reembolso/retry, MEN-92 pagamento na entrega.

## States requested

Awaiting payment, paid, ready, available for pickup, completed, cancelled, refunded, expired/unpaid. Pay-on-delivery must be identifiable **without blocking fulfilment**.

## Recommended direction (not the final machine)

Separate three situations so an order can be ready/completed and not yet paid:

- **Financial** — awaiting payment, paid, refunded, expired/unpaid.
- **Fulfilment** — received, in preparation, ready, completed, cancelled.
- **Delivery** — not dispatched, dispatched, in transit, delivered, pickup.

The final state machine and the permissions for payment, cancellation and refund are open (`../../product/open-decisions.md`). Do not hardcode a single status column that conflates the three.

## Transitions

- Online orders are accepted automatically **after payment**.
- Pay-on-delivery enters fulfilment **before** payment; the store marks receipt per permission, which is when commission/cashback apply.
- Repeat-order is available; revalidate price, stock and availability.
- Cancellation after payment vs refund, post-payment edit/substitution, and partial refund are open; **refund is total only** in the MVP (MEN-94).

## Code entry points

- `Order` model (`packages/db`, tenant-scoped, `Int` cents). Panel reads `panel.listOrders`, `panel.getOrder` by human order code.
- Transition side effects (write-off, commission, cashback, dispatch, notifications) are idempotent and run through the order service + `apps/worker`.
- UI under `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/orders/`.

## Checks

- Duplicate payment confirmation adds no duplicate commission/cashback/dispatch. → `../../engineering/checks.md` scenario 5.
- A scheduled order is not delivered early. → scenario 9.
- Notifications follow preferences, permissions and tenant. → scenario 11.
