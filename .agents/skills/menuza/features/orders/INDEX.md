# orders/ index

| File           | Holds                                                                                         | Keywords                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`    | Order lifecycle overview, code entry points, checks                                           | order, state, paid, refund, repeat                                                                                                                                                                                                             |
| `lifecycle.md` | States, financial/fulfilment/delivery split, transitions                                      | state machine, transition, cancellation, refund                                                                                                                                                                                                |
| `coupons.md`   | Coupon types, product scope, status derivation, stacking, application order, panel form rules | coupon, cupom, discount, freight shipping discount, stacking, primeira compra, first purchase, global limit, per-customer limit, escopo de produto, produtos válidos, expired derivado, form, money mask, percent mask, datepicker, validation |

Tickets: MEN-93 pedidos, MEN-94 reembolso/retry, MEN-97/98 cupons, MEN-116..120 (post-MVP ops).
Notifications: `../notifications/`. Customers and KPIs: `../customers/`.
Checks: `../../engineering/checks.md` scenarios 5, 11.
