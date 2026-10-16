# Coupons and promotions

`PRODUCT.md` §16. Tickets: MEN-97 cupons, MEN-98 ordem de aplicacao.

## Types

Fixed or percentage discount **on the order**; a percentage discount **on the freight** (`shippingDiscountPercent`, 0–100) that stacks on top of the order discount; free shipping (a 100% freight discount); first purchase; minimum value; eligible products; global and per-customer use limit; validity; delivery-mode restriction.

## Stacking

- Coupon stacking is configurable **per coupon**.
- Stacking with kits, progressive discounts and free shipping is configurable.
- **Open (MEN-98):** the application order, each discount's base, and the precedence when one coupon allows stacking and another forbids it. Do not invent precedence.

## Invariants

- **Totals can never go negative.**
- Use limits must survive **concurrent** purchases (a per-customer coupon used twice at once must be refused at least once).
- A coupon belongs to one tenant and never affects another's order.

## Management surface (implemented)

- Schema (`packages/db`): `Coupon` has `description`, `usageLimit`, `perCustomerLimit`, `minimumOrderCents`, `maximumDiscountCents`, `shippingDiscountPercent`, optional `startsAt`/`endsAt`, `stackable` and `firstPurchaseOnly`.
- One coupon carries **two** discounts at once: the order discount (`discountType` + `value`) and the optional freight discount (`shippingDiscountPercent`, null = no freight discount). They are independent; the freight one is never derived from the order one.
- Panel contracts (`packages/shared`): `panel.listCoupons`, `panel.createCoupon`, `panel.updateCoupon`, `panel.deleteCoupon`.
- API impls: `packages/api-tenant/.../panel/listCoupons.impl.ts`, `createCoupon.impl.ts`, `updateCoupon.impl.ts`, `deleteCoupon.impl.ts`.
- Dashboard: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/` — `page.tsx` (DataTable list), `/new` create page, `/[couponId]` edit page, destructive delete behind an `AlertDialog`. Both form routes are full pages, never modals, and each ships a `loading.tsx`.
- Limits are stored opt-in; null means unlimited.
- Statuses are `active`, `expired`, `disabled`. `value` remains one Int column and is split into `valueCents`/`valuePercent` at the read boundary.
- Codes are normalized to uppercase, unique per tenant.

## Dashboard form rules

The panel's visual system is `apps/web/DESIGN.md` — authoritative for tokens, recipes and the money/percent entry rules. What the coupon form pins for every panel form:

- `@tanstack/react-form` with the shared Valibot schema (`CreateCouponInputSchema` / `UpdateCouponInputSchema`) as the `onSubmit` + `onBlur` validator — the same schema the API enforces, including percentual ≤ 100.
- Every user-facing message is pt-BR: Valibot's defaults are English, so each `v.string` / `v.nonEmpty` / `v.maxLength` / `v.picklist` carries an explicit message. A schema-level `v.check` has no `path`, so it surfaces as a **form**-level error the field renderer never shows — anything tied to one field (e.g. percentual ≤ 100) also needs a field validator in the form.
- Form state stays in **integer cents**; the UI converts at the edge (`maskBrlInput` while typing, `formatBrlInput` for committed digits, `parseBrlToCents` back to cents). Percent is digits-only, 1–100. Money and percent use `InputGroup` with an `R$` / `%` addon; switching discount type recalculates the visible value (R$ ↔ %) instead of leaving `1500` in a percent field.
- A field error shows when the field is touched **or** the form was submitted; a failed submit focuses the first `[aria-invalid="true"]`. Server errors render in an `Alert` with a pt-BR message mapped from the ORPC code — never the raw English `message`.
- `ToggleGroup` for the tipo/status option sets, `AlertDialog` for the destructive confirm, `Spinner` on pending buttons. Every control carries `id={field.name}` so its `FieldLabel htmlFor` resolves.
- Labels follow the product's words: "Uso máximo global" is the coupon-wide cap on redemptions (`usageLimit`, not per customer) and "Limite por cliente" is `perCustomerLimit`. "Uso único por cliente" is the `firstPurchaseOnly` checkbox.
- `firstPurchaseOnly` owns `perCustomerLimit`: checking it sets the field to `1` and disables the input, unchecking clears it back to unlimited, and the edit form loads `1` for a legacy row that has the flag without the number. Two overlapping labels would otherwise let the user set "uso único" and "limite 5" at once.
- Date fields use the Popover + `Calendar` `DatePicker` with `minDate`/`maxDate` fixed at module load — `<input type="date">` is banned, and the calendar's year dropdown only lists the years inside those bounds.

## Code entry points

- `Coupon` model (`packages/db`, tenant-scoped, `Int` cents); panel reads/writes `panel.*Coupon`; buyer application in the commerce checkout.
- Application order is a single, tested function - not scattered subtraction - so the open precedence has one place to change.

## Checks

- Checkout applies discounts reproducibly and never yields a negative total. → `../../engineering/checks.md` scenario 8.
- A per-customer limit holds under concurrent redemption.
- The panel form refuses the same input the API refuses (percentual 1–100, code uniqueness → `CONFLICT` shown as pt-BR), and money round-trips through the typing masks (`maskBrlInput` → `parseBrlToCents`). Covered by `apps/web/tests/dashboard-routes.test.ts` and `packages/shared/test/panel-contracts.test.ts`.
