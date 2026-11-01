# Coupons and promotions

`PRODUCT.md` §16. Tickets: MEN-97 cupons, MEN-98 ordem de aplicacao.

## Types

A discount **on the order** — `percentage` (whole percent, 1–100) or `fixed` (integer cents, ≥ 1) — plus, independently, a percentage discount **on the freight** (`shippingDiscountPercent`, 0–100), where 100 is free shipping. The freight discount is never derived from the order one, and a coupon may carry only the freight one.

- `stackable` lets the coupon apply alongside other stackable coupons.
- `minimumOrderCents` is the order value the coupon requires (`below_minimum` otherwise).
- `maximumDiscountCents` caps what the coupon can take off, whatever the base.
- `usageLimit` ("Uso máximo global") caps the coupon's redemptions store-wide; `perCustomerLimit` caps one customer's uses. Both are empty = unlimited, and an integer ≥ 1 when set. Nothing couples them to another switch.
- `firstPurchaseOnly` ("Primeira compra") is an independent boolean: the coupon applies only to a customer with no previous order (`not_first_purchase` otherwise). It never writes `perCustomerLimit`.
- `startsAt`/`endsAt` are whole days: a coupon ending "31/10" runs through the end of 31/10, and the server widens a bare date to the day boundary.

## Product scope

- `Coupon.productScopeMode` is `include` or `exclude`, and `CouponProduct` is the join listing the products (composite `(couponId, productId)`, own `tenantId`, tenant-guard trigger — same shape as `ProductTag`).
- `include` applies the coupon only to the listed products; `exclude` applies it to every product but the listed ones. An empty set means **all products in both modes**, so an unscoped coupon needs no special case.
- Enforcement lives in `priceOrder()` (`@menuza/shared/src/commerce/pricing/price-order.ts`), the pure engine — not in the dashboard and not in the order service. `create.impl.ts` only feeds it: one tenant-scoped `CouponProduct` read over the priced coupon ids, batched with the pre-transaction pricing snapshot — before the order transaction starts, matching the coupon/value/window snapshot semantics — mapped into `CouponInput.productScopeMode`/`productIds`, with each line's `productId` on `PriceLineInput`.
- A scope that matches no line item **rejects** the coupon with reason `product_scope`. Never a silent zero discount, and a rejected coupon records no redemption.
- Partial eligibility: a percentage coupon discounts the **eligible gross subtotal**, not the whole order; a fixed amount stays whole-order and is capped by that same eligible subtotal.
- One redemption per order however many lines matched: `applyCoupons()` folds the applied discounts by `couponId` before writing `CouponRedemption`, which is unique on `(couponId, orderId)`.

## Status

- Two surfaces: the list switch calls `panel.setCouponStatus` (`POST /panel/stores/{storeSlug}/coupons/{couponId}/status`, body `status: active | disabled`) and is **status-only** — the window columns belong to the form, so a switch never moves a coupon's dates. The form (`updateCoupon`) takes the whole row. `CreateCouponInputSchema`, `UpdateCouponInputSchema` and `SetCouponStatusInputSchema` accept exactly `active` or `disabled`; `expired` is never selectable in the UI.
- Turning **off** always stores `disabled`, whatever the window says — the read path keeps a stored `disabled` past `endsAt`, because the merchant turned it off and that outranks the window.
- Turning **on** a coupon whose window has closed is refused, never stored: `setCouponStatus` derives with `resolveCouponStatus()` and returns the validation message "O cupom já expirou: ajuste a data de término para ativá-lo." No row is written `active` past `endsAt`.
- The form still derives on save: `resolveCouponStatus()` records `expired` when the submitted window is already closed, and the switch value otherwise. A legacy row already stored as `expired` is reset by its next save.
- Reads derive it: `effectiveCouponStatus()` turns a stored `active` past its window into `expired`, which is what `effectiveStatus` carries, so an untouched row still reads honestly.
- Soft delete: `Coupon.deletedAt` hides the coupon from every panel read (`listCoupons`, `listCouponSummaries`, `getCouponDetail`) and from `setCouponStatus`, which answers `NOT_FOUND` — an archived coupon is history and cannot be switched back on. A coupon an order or a redemption names is archived (`deletedAt` stamped, status `disabled`) instead of deleted, so the ledger keeps the discount; both delete paths report `archived`.

## Stacking

- Coupon stacking is configurable **per coupon**.
- Stacking with kits, progressive discounts and free shipping is configurable.
- **Open (MEN-98):** the application order, each discount's base, and the precedence when one coupon allows stacking and another forbids it. Do not invent precedence.

## Invariants

- **Totals can never go negative.**
- Use limits must survive **concurrent** purchases (a per-customer coupon used twice at once must be refused at least once).
- A coupon belongs to one tenant and never affects another's order.

## Management surface (implemented)

- Schema (`packages/db`): `Coupon` has `description`, `usageLimit`, `perCustomerLimit`, `minimumOrderCents`, `maximumDiscountCents`, `shippingDiscountPercent`, `productScopeMode`, optional `startsAt`/`endsAt`, `stackable` and `firstPurchaseOnly`; `CouponProduct` holds the scope.
- One coupon carries **two** discounts at once: the order discount (`discountType` + `value`) and the optional freight discount (`shippingDiscountPercent`, null = no freight discount). They are independent; the freight one is never derived from the order one.
- Panel contracts (`packages/shared`): `panel.listCoupons`, `panel.listCouponSummaries`, `panel.getCouponDetail`, `panel.createCoupon`, `panel.updateCoupon`, `panel.deleteCoupon`.
- API impls: `packages/api-tenant/.../panel/listCoupons.impl.ts`, `listCouponSummaries.impl.ts`, `getCouponDetail.impl.ts`, `createCoupon.impl.ts`, `updateCoupon.impl.ts`, `deleteCoupon.impl.ts`, with the status and summary rules in `coupon-status.ts`, `coupon-summary.ts` and `coupon-window.ts`.
- Dashboard: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/` — `page.tsx` (DataTable list), `/new` create page, `/[couponId]` edit page with the tabs Edição, Desempenho and Resgates (Edição first and default), destructive delete behind an `AlertDialog`. Both form routes are full pages, never modals, and each ships a `loading.tsx`.
- `value` stays one Int column and is split into `valueCents`/`valuePercent` at the read boundary.
- Codes are normalized to uppercase, unique per tenant.

## Dashboard form rules

The panel's visual system is `apps/web/DESIGN.md` — authoritative for tokens, recipes and the money/percent entry rules. What the coupon form pins for every panel form:

- `@tanstack/react-form` with the shared Valibot schema (`CreateCouponInputSchema` / `UpdateCouponInputSchema`) as the `onSubmit` + `onBlur` validator — the same schema the API enforces, including percentual ≤ 100.
- Every user-facing message is pt-BR: Valibot's defaults are English, so each `v.string` / `v.nonEmpty` / `v.maxLength` / `v.picklist` carries an explicit message. A schema-level `v.check` has no `path`, so it surfaces as a **form**-level error the field renderer never shows — anything tied to one field (e.g. percentual ≤ 100) also needs a field validator in the form.
- Form state stays in **integer cents**; the UI converts at the edge (`maskBrlInput` while typing, `formatBrlInput` for committed digits, `parseBrlToCents` back to cents). Percent is digits-only, 1–100. Money and percent use `InputGroup` with an `R$` / `%` addon; switching discount type recalculates the visible value (R$ ↔ %) instead of leaving `1500` in a percent field.
- A field error shows when the field is touched **or** the form was submitted; a failed submit focuses the first `[aria-invalid="true"]`. Server errors render in an `Alert` with a pt-BR message mapped from the ORPC code — never the raw English `message`.
- `ToggleGroup` for the discount-type option set, `Switch` for the status and the two boolean toggles, `AlertDialog` for the destructive confirm, `Spinner` on pending buttons. Every control carries `id={field.name}` so its `FieldLabel htmlFor` resolves.
- Labels follow the product's words: "Uso máximo global" is the coupon-wide cap on redemptions (`usageLimit`, not per customer) and "Limite por cliente" is `perCustomerLimit`, described as "Opcional. Vazio = ilimitado". The status `Switch` labelled "Ativo" lives in **Identificação** (with a note when the stored coupon is already expired); "Primeira compra" is `firstPurchaseOnly`, its own `Switch`, with no effect on the per-customer limit.
- "Produtos válidos" is its own section: a `Switch` "Bloquear uso em produtos específicos" picks `exclude` (on) or `include` (off), a searchable `combobox` + `popover` over `panel.listProducts` adds products as removable `Badge` chips, and an empty selection means every product.
- Date fields use the Popover + `Calendar` `DatePicker` with `minDate`/`maxDate` fixed at module load — `<input type="date">` is banned, and the calendar's year dropdown only lists the years inside those bounds.

## Not shipped (future)

- **Regiões válidas** — delivery-region restriction on the coupon; a future section, never submitted.
- **Requisitos** — customer eligibility rules (account age in days, more than X orders, account created before/after a date, minimum order value beyond `minimumOrderCents`); future.

## Code entry points

- `Coupon` and `CouponProduct` models (`packages/db`, tenant-scoped, `Int` cents); panel reads/writes `panel.*Coupon`; buyer application in the commerce checkout.
- `priceOrder()` owns eligibility, the scope base and the amount; `create.impl.ts` supplies the tenant-scoped snapshot and records the redemptions. Application order is a single, tested function — not scattered subtraction — so the open precedence has one place to change.

## Checks

- Checkout applies discounts reproducibly and never yields a negative total. → `../../engineering/checks.md` scenario 8.
- A per-customer limit holds under concurrent redemption.
- Product scope: an `include` that matches no line rejects as `product_scope`; a partial match discounts only the eligible subtotal. → `packages/shared/src/commerce/pricing/price-order.test.ts`.
- Status: the write path stores `expired` only from the window, and a stored `disabled` reads `disabled` past it. → `packages/api-tenant/.../panel/coupon-status.test.ts`.
- The panel form refuses the same input the API refuses (percentual 1–100, code uniqueness → `CONFLICT` shown as pt-BR), and money round-trips through the typing masks (`maskBrlInput` → `parseBrlToCents`). Covered by `apps/web/tests/dashboard-routes.test.ts` and `packages/shared/test/panel-contracts.test.ts`.
