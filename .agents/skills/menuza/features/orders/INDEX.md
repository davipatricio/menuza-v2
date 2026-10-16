# orders/ index

| File | Holds | Keywords |
| --- | --- | --- |
| `README.md` | Order lifecycle overview, code entry points, checks | order, state, paid, refund, repeat |
| `lifecycle.md` | States, financial/fulfilment/delivery split, transitions | state machine, transition, cancellation, refund |
| `coupons.md` | Coupon types, stacking, application order, panel form rules | coupon, discount, freight shipping discount, stacking, first purchase, single use, global limit, form, money mask, percent mask, datepicker, validation |

Tickets: MEN-93 pedidos, MEN-94 reembolso/retry, MEN-97/98 cupons, MEN-116..120 (post-MVP ops).
Notifications: `../notifications/`. Customers and KPIs: `../customers/`.
Checks: `../../engineering/checks.md` scenarios 5, 11.
