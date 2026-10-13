# Coupons and promotions

`PRODUCT.md` §16. Tickets: MEN-97 cupons, MEN-98 ordem de aplicacao.

## Types

Fixed or percentage discount; free shipping; first purchase; minimum value; eligible products; global and per-customer use limit; validity; delivery-mode restriction.

## Stacking

- Coupon stacking is configurable **per coupon**.
- Stacking with kits, progressive discounts and free shipping is configurable.
- **Open (MEN-98):** the application order, each discount's base, and the precedence when one coupon allows stacking and another forbids it. Do not invent precedence.

## Invariants

- **Totals can never go negative.**
- Use limits must survive **concurrent** purchases (a per-customer coupon used twice at once must be refused at least once).
- A coupon belongs to one tenant and never affects another's order.

## Code entry points

- `Coupon` model (`packages/db`, tenant-scoped, `Int` cents); panel reads `panel.listCoupons`; buyer application in the commerce checkout.
- Application order is a single, tested function — not scattered subtraction — so the open precedence has one place to change.

## Checks

- Checkout applies discounts reproducibly and never yields a negative total. → `../../engineering/checks.md` scenario 8.
- A per-customer limit holds under concurrent redemption.
