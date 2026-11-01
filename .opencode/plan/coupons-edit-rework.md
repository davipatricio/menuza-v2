# Rework the coupon edit tab: status switch, first-purchase switch, product scope, honest future sections

Status: active
Updated: complete

## Non-goals

- No regions / requirements implementation (disabled "Em breve" only, never submitted).
- No checkout/storefront coupon UI, no payments/refunds, no unrelated refactors.
- No partial rewrite of `UpdateCouponInputSchema`; the whole-row update stays.
- No manual admin selection of `expired`.
- No commits or staging.

## Assumptions

- verified: tabs live in `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/[couponId]/coupon-tabs.tsx`; `TABS = ["desempenho","resgates","edicao"]`, nuqs `parseAsStringLiteral` default `desempenho`.
- verified (corrected path): tenant coupon impls are flat in `packages/api-tenant/src/domains/tenant/subdomains/panel/` â€” `createCoupon.impl.ts`, `updateCoupon.impl.ts`, `getCouponDetail.impl.ts`, `coupon-summary.ts`, `coupon-window.ts`, `coupon-window.test.ts`.
- verified (corrected path): commerce pricing lives in `packages/api-commerce/src/domains/commerce/subdomains/orders/` â€” `create.impl.ts` and `money.ts`.
- verified: `applyCoupons()` in `money.ts` only folds `AppliedDiscount[]` into redemptions under `forUpdate`; it does **not** compute the discount. The discount base is computed by the pure engine `priceOrder()` in `packages/shared/src/commerce/pricing/price-order.ts` (percentage uses `subtotalCents` at line 106). Product scope therefore belongs in `priceOrder()`, not `money.ts`.
- verified: `PriceLineInput` (`pricing/types.ts` 13-19) has no `productId`; `CouponInput` (25-46) has no scope fields; `RejectedCoupon.reason` (67-79) is a closed union that needs a new literal.
- verified: `effectiveCouponStatus()` in `coupon-summary.ts` derives `expired` at read time; `updateCoupon.impl.ts` whole-row `updateAll`; `couponWindow()` in `coupon-window.ts` (already has `coupon-window.test.ts`).
- verified: `UpdateCouponInputSchema` (`packages/shared/src/panel/contracts.ts` 1981) is whole-row: `code`, `discountType`, `discountValue`, `stackable`, `firstPurchaseOnly`, `status` required; rest `optional(nullable)`; `startsAt`/`endsAt` `v.optional(v.string())`.
- verified: join-table house style = composite `@@id`, own `tenantId`, trigger `menuza_join_tenant_guard` (`ProductTag` ~558, `CategoryDepartment` ~447 in `packages/db/prisma/contract.prisma`).
- verified: coupon docs already exist at `.agents/skills/menuza/features/orders/coupons.md`; line 29 lists statuses, lines 41-42 pin the old `firstPurchaseOnly` â†’ `perCustomerLimit = 1` rule, so both are made wrong by this change.
- verified (line map of `coupon-form.tsx`): `COUPON_STATUS_ITEMS_CREATE` 44, `COUPON_STATUS_ITEMS_EDIT` 49; `CouponFormFields` 246; "IdentificaÃ§Ã£o" 276-324; "Desconto" 326; "Limites e validade" **508-670**; per-customer limit field + `firstPurchaseOnly` subscription 529-553 (forced `value` 537, `disabled` 540, "Travado em 1â€¦" 545-547); startsAt/endsAt 555-612; **Status `ToggleGroup` 613-635 (inside Limites, not IdentificaÃ§Ã£o)**; stackable 636-650; `firstPurchaseOnly` Checkbox 651-667 with the `perCustomerLimit` side effect at 657-662; create defaults 710-736 (`status: "active"` 726); edit defaults 793-813 with `status: coupon.status` 812 and the legacy coercion 802-804.
- verified: `coupons-webmcp.ts` never sends `status: "expired"` on a write â€” line 16 is a **read/filter** input `v.optional(v.picklist(["active","expired","disabled"]))`, line 33 mirrors it as the tool schema enum, line 50 emits `coupon.effectiveStatus`. So dropping `expired` from the panel **write** schemas needs no change there, and the filter keeps all three values.
- unverified: exact Prisma 8 rc.27 `@@check` syntax â€” copy the form used by the neighbouring checks in `contract.prisma`.
- unverified: whether `create.impl.ts` maps `RejectedCoupon.reason` to a typed error or ignores it; S10 reads it before adding `product_scope`.

## Behaviour contract (settled; encode in code + docs)

- Scope empty (`productIds = []`) = all products, in both modes.
- `include`: a coupon applies only to listed products; `exclude`: to every product not listed.
- Scope matches no line item â‡’ **reject** the coupon with a new reason `product_scope` (never a silent zero discount).
- Only some lines eligible â‡’ percentage applies to the **eligible gross subtotal**; fixed amounts stay whole-order and are capped by the remaining eligible subtotal. One redemption per order regardless of how many lines matched.
- Status: `expired` is derived, never client-settable. Write path stores `endsAt < now ? "expired" : (switch ? "active" : "disabled")` on every save; read path keeps `effectiveCouponStatus()`. Legacy rows already stored as `expired` stay readable and are reset to `active`/`disabled` on the next save. Decision (S9 review): a stored `disabled` keeps reading `disabled` past its end date â€” merchant intent outranks the window; only a stored `active` past `endsAt` reads `expired`.
- `firstPurchaseOnly` no longer touches `perCustomerLimit`; per-customer limit is free (integer â‰¥ 1 or empty = unlimited). Both are optional columns already.

## Code map

Persistence

- `packages/db/prisma/contract.prisma` â€” `Coupon` ~992, new `CouponProduct` join model, `Product` ~493 back-relation
- `packages/db/prisma/migrations/<new>/migration.ts` â€” generated

Shared

- `packages/shared/src/commerce/pricing/types.ts` â€” `PriceLineInput` 13, `CouponInput` 25, `RejectedCoupon` 67
- `packages/shared/src/commerce/pricing/price-order.ts` â€” `priceOrder()` 41, `ineligibility()` helper, coupon loop 75-130
- `packages/shared/src/commerce/pricing/price-order.test.ts` â€” engine tests
- `packages/shared/src/panel/contracts.ts` â€” `PanelCouponSchema` 1011, `PanelCouponSummarySchema` 1038, `PanelCouponDetailOutput` 1106, `CreateCouponInputSchema` 1912, `UpdateCouponInputSchema` 1981, `PanelProductSchema` ~375

Tenant API

- `packages/api-tenant/src/domains/tenant/subdomains/panel/coupon-status.ts` (new) â€” `resolveCouponStatus()`
- `.../panel/createCoupon.impl.ts`, `.../panel/updateCoupon.impl.ts` â€” status + scope persistence
- `.../panel/coupon-summary.ts` â€” `effectiveCouponStatus()`, `toCouponSummary()`
- `.../panel/getCouponDetail.impl.ts` â€” detail payload with scoped products
- `.../panel/coupon-window.ts` + `coupon-window.test.ts` â€” end-of-day window

Commerce

- `packages/api-commerce/src/domains/commerce/subdomains/orders/create.impl.ts` â€” loads coupon rows, builds `CouponInput`
- `.../orders/money.ts` â€” `applyCoupons()` (redemption recording only; touch only if the new reason must surface an error)

Dashboard

- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/[couponId]/coupon-tabs.tsx`
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupon-form.tsx` (853 lines) â€” status ToggleGroup 613-635 (in Limites), firstPurchaseOnly Checkbox 651-667, limit field 529-553, edit defaults 793-813
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupons-webmcp.ts` â€” check for a caller sending `status: "expired"`
- new `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupon-product-picker.tsx`
- `apps/web/src/components/ui/switch.tsx` (Base UI, `size` prop), `combobox.tsx`, `popover.tsx`, `badge.tsx`, `field.tsx`
- `apps/web/src/lib/panel-labels.ts` â€” `COUPON_STATUS_LABELS` 73, `COUPON_STATUS_VARIANTS` 76, `DISCOUNT_TYPE_LABELS` 83

Docs

- `.agents/skills/menuza/features/orders/coupons.md` (exists â€” update lines 29, 41-42, add product scope + status derivation + enforcement point)
- `.agents/skills/menuza/features/orders/INDEX.md`, `.agents/skills/menuza/INDEX.md` â€” keyword rows
- `packages/shared/AGENTS.md`, `packages/api-commerce/AGENTS.md`, `packages/api-tenant/AGENTS.md`, `packages/db/AGENTS.md`, root `PRODUCT.md` â€” only the lines this change falsifies

Linear

- `MEN-97` â€” coupon edit rework

## Steps

### Phase 1 â€” persistence + shared contracts

- [x] S1 Add product-scope persistence | goal: `Coupon.productScopeMode` text default `"include"` with CHECK, plus `CouponProduct` join model (composite `@@id([couponId, productId])`, own `tenantId`, cascade FKs, `@@index([tenantId, productId])`, `menuza_join_tenant_guard` trigger copied from `ProductTag`) and the `Product.couponProducts` back-relation | files: `packages/db/prisma/contract.prisma` | owner: implementer | verify: `bun run db:migrate` && `bun run db:generate` && `bun run db:deploy` && `bunx prisma migration status` | P1
- [x] S2 Review the migration | goal: CHECK expressions, trigger, cascade and tenant guard match house style; existing coupon rows unaffected | files: `packages/db/prisma/contract.prisma`, `packages/db/prisma/migrations/*` | owner: reviewer | verify: `bun run typecheck` | P2
- [x] S3 Product scope in the pricing engine | goal: add `productId` to `PriceLineInput`; add `productScopeMode: "include" | "exclude"` and `productIds: string[]` to `CouponInput`; add `"product_scope"` to `RejectedCoupon.reason`; compute each coupon's eligible gross subtotal (empty scope = all lines) and reject on `include` with zero matches, per the behaviour contract; percentage uses the eligible subtotal, fixed capped by it | files: `packages/shared/src/commerce/pricing/types.ts`, `.../pricing/price-order.ts` | owner: implementer | verify: `bun run typecheck` && `bun test packages/shared` | P3
- [x] S4 Test the pricing branches | goal: one test per branch â€” include-hit, include-miss â†’ `product_scope`, exclude-hit, exclude-miss â†’ `product_scope`, empty scope = all, partial eligibility percentage base, fixed cap | files: `packages/shared/src/commerce/pricing/price-order.test.ts` | owner: implementer | verify: `bun test packages/shared` | P4
- [x] S5 Extend the panel contracts | goal: add `productScopeMode` + `productIds` (max 200, deduped) to create/update inputs (optional; `[]` = all) and to `PanelCouponSchema`/`PanelCouponSummarySchema`/`PanelCouponDetailOutput`; narrow the **write** `status` literal to `"active" | "disabled"` in `CreateCouponInputSchema` and `UpdateCouponInputSchema` only â€” read payloads keep `"expired"`. `coupons-webmcp.ts` is verified read-only (Assumptions) and needs **no** edit: do not touch it | files: `packages/shared/src/panel/contracts.ts` | owner: implementer | verify: `bun run typecheck` && `bun test packages/shared` && `rg -n 'expired' packages/shared/src/panel/contracts.ts` (hits only read schemas / `effectiveStatus`) | P5
- [x] S6 Review the contracts | goal: whole-row update semantics preserved, panel vs public payloads separate, Valibot only, no `expired` in write unions | files: `packages/shared/src/panel/contracts.ts`, `packages/shared/src/commerce/pricing/*` | owner: reviewer | verify: `bun run typecheck` | P6

### Phase 2 â€” tenant API

- [x] S7 Status derivation + scope write | goal: new `resolveCouponStatus({ requested, endsAt, now })` returning `"expired"` when `endsAt` is before `now` else the requested value; use it in create and update; persist `productScopeMode` and replace the `CouponProduct` set inside the same transaction (delete-then-create, tenant-scoped) | files: `.../panel/coupon-status.ts` (new), `.../panel/createCoupon.impl.ts`, `.../panel/updateCoupon.impl.ts` | owner: implementer | verify: `bun run typecheck` && `bun test packages/api-tenant` | P7
- [x] S8 Detail read | goal: `toCouponSummary()` returns `productScopeMode`, `productIds` and a `products` list (id + name) via one `couponProduct.findMany({ include: { product: â€¦ } })`; `getCouponDetail.impl.ts` uses it | files: `.../panel/coupon-summary.ts`, `.../panel/getCouponDetail.impl.ts` | owner: implementer | verify: `bun test packages/api-tenant` | P8
- [x] S9 Review the tenant API | goal: derivation idempotent, legacy `expired` rows readable, scope write transactional and tenant-scoped, no N+1 | files: `.../panel/coupon-status.ts`, `.../panel/coupon-summary.ts`, `.../panel/createCoupon.impl.ts`, `.../panel/updateCoupon.impl.ts`, `.../panel/getCouponDetail.impl.ts` | owner: reviewer | verify: `bun run typecheck` | P9

### Phase 3 â€” commerce enforcement

- [x] S10 Wire scope into order creation | goal: in `create.impl.ts`, load `CouponProduct` rows for the priced coupons inside the existing transaction, map `productScopeMode` + `productIds` into `CouponInput`, map each line's `productId` into `PriceLineInput`, and surface the new `product_scope` rejection the same way existing rejection reasons surface (typed pt-BR error, not a silent zero) | files: `packages/api-commerce/src/domains/commerce/subdomains/orders/create.impl.ts`, `.../orders/money.ts` (only if the reason must raise) | owner: implementer | verify: `bun run typecheck` && `bun test packages/api-commerce` | P10
- [x] S11 Review the enforcement | goal: scope read inside the same transaction, single enforcement point (no UI duplicate), `forUpdate` untouched, one redemption per order | files: `.../orders/create.impl.ts`, `.../orders/money.ts` | owner: reviewer | verify: `bun run typecheck` | P11

### Phase 4 â€” dashboard UI (serial: all touch `coupon-form.tsx`)

- [x] S12 Tabs: EdiÃ§Ã£o first and default | goal: `TABS = ["edicao","desempenho","resgates"]`, nuqs default `edicao`, `keepMounted` unchanged | files: `.../coupons/[couponId]/coupon-tabs.tsx` | owner: implementer | verify: `bun run typecheck` && `bun run design:check` | P12
- [x] S13 Status switch in IdentificaÃ§Ã£o | goal: **delete the whole Status `form.Field` (lines 613-635) from the "Limites e validade" card**, so that card keeps only limits + dates + stackable + primeira compra; then render a `Switch` inside the "IdentificaÃ§Ã£o" `FormSection` (276-324, after the code/description fields) with `id="status"`, a `FieldLabel htmlFor="status"` reading "Ativo" and a `FieldDescription` explaining "Desativado deixa de aceitar resgates"; `checked={field.state.value === "active"}`, `onCheckedChange={(checked) => field.handleChange(checked ? "active" : "disabled")}`; drop `expired` from `COUPON_STATUS_ITEMS_EDIT` (49) and `COUPON_STATUS_ITEMS_CREATE` (44); in the edit defaults (812) map a stored `"expired"` to `"disabled"` (`coupon.status === "active" ? "active" : "disabled"`) so the narrowed schema validates and the switch renders honestly; inline note only in edit mode when `coupon.effectiveStatus === "expired"` | files: `.../coupons/coupon-form.tsx`, `apps/web/src/lib/panel-labels.ts` | owner: implementer | verify: `bun run typecheck` && `bunx oxfmt`+`bunx oxlint` on both paths && `bun run design:check` && `rg -n 'COUPON_STATUS_ITEMS' apps/web` (no hits) and `rg -n 'name="status"' apps/web/src/app/\(dashboard\)/dashboard/\[storeSlug\]/coupons/coupon-form.tsx` (one hit, inside IdentificaÃ§Ã£o) | P13
- [x] S14 First-purchase Switch; per-customer limit free | goal: in "Limites e validade" **replace** the `firstPurchaseOnly` `Checkbox` (651-667) with the Base UI `Switch` (same `id`/`FieldLabel`), relabel `FieldLabel` to **"Primeira compra"** and add a `FieldDescription` ("Restringe o cupom ao primeiro pedido do cliente. Independente do limite por cliente."); delete the `form.setFieldValue("perCustomerLimit", checked ? 1 : undefined)` side effect (657-662) and the comment above it; delete the `form.Subscribe` wrapper on `perCustomerLimit` (529-553) so the field is a plain `form.Field`, and inside it drop `value={firstPurchaseOnly ? 1 : â€¦}` (537) replaced by `value={field.state.value}`, `disabled={firstPurchaseOnly}` (540), and the "Travado em 1 enquantoâ€¦" branch (545-547) replaced by the single "Opcional. Vazio = ilimitado."; delete the legacy coercion in edit defaults (802-804, with its comment) so it reads `perCustomerLimit: coupon.perCustomerLimit ?? undefined`; submit maps empty to `null` (unlimited) and accepts integer â‰¥ 1 only | files: `.../coupons/coupon-form.tsx` | owner: implementer | verify: `bun run typecheck` && `bun run design:check` && `rg -n 'Uso Ãºnico por cliente|Travado em 1|setFieldValue\("perCustomerLimit"' apps/web` (no hits) | P14
- [x] S15 Product scope picker | goal: "Produtos vÃ¡lidos" FormSection with a `Switch` "Bloquear uso em produtos especÃ­ficos" (include vs exclude), searchable multi-select (`combobox` + `popover` over `listProducts`), removable `Badge` chips, empty = todos os produtos; wire `productScopeMode` + `productIds` into the payload | files: `.../coupons/coupon-product-picker.tsx` (new), `.../coupons/coupon-form.tsx` | owner: implementer | verify: `bun run typecheck` && `bun run design:check` | P15
- [x] S16 Future sections | goal: "RegiÃµes vÃ¡lidas" and "Requisitos" as disabled cards with an "Em breve" `Badge` and one line of pt-BR copy; no fields, no payload keys, no submit path | files: `.../coupons/coupon-form.tsx` | owner: implementer | verify: `bun run typecheck` && `bun run design:check` | P16
- [x] S17 Review the UI | goal: status `Switch` lives in IdentificaÃ§Ã£o and the Status block is gone from Limites; first purchase is a `Switch` labelled "Primeira compra" with no `perCustomerLimit` coupling; no dead payload keys, `gap-*` only, semantic tokens, `Switch` from `components/ui/switch.tsx`, accessible names on both switches and the picker, `expired` never selectable | files: all Phase 4 paths | owner: reviewer | verify: `bun run design:check` && `rg -n 'name="status"' apps/web/src/app/\(dashboard\)/dashboard/\[storeSlug\]/coupons/coupon-form.tsx` shows the Switch in IdentificaÃ§Ã£o (before the "Desconto" FormSection) | P17

### Phase 5 â€” docs + tracker

- [x] S18 Update the coupons skill doc | goal: rewrite `.agents/skills/menuza/features/orders/coupons.md` to shipped behaviour â€” discount types, limits (global cap vs per-customer free, `firstPurchaseOnly` independent), product scope include/exclude + reject-on-no-match + eligible-subtotal base, status derivation (stored vs `effectiveStatus`, `expired` never manual, switch sends only active/disabled), enforcement point (`priceOrder()` fed by `create.impl.ts`); drop the stale lines 29 and 41-42; add keyword rows to `features/orders/INDEX.md` and the root `INDEX.md` | files: `.agents/skills/menuza/features/orders/coupons.md`, `.agents/skills/menuza/features/orders/INDEX.md`, `.agents/skills/menuza/INDEX.md` | owner: implementer | verify: `rg -n 'Uso Ãºnico por cliente|Travado em 1|perCustomerLimit = 1|owns .perCustomerLimit' .agents/skills/menuza apps/web packages` returns no hits, and `rg -n 'cupom|coupon|escopo de produto' .agents/skills/menuza/features/orders/INDEX.md .agents/skills/menuza/INDEX.md` shows the coupons row | P18
- [x] S19 Fix stale docs elsewhere | goal: grep `packages/shared/AGENTS.md`, `packages/api-commerce/AGENTS.md`, `packages/api-tenant/AGENTS.md`, `packages/db/AGENTS.md`, root `PRODUCT.md` for coupon claims this change falsifies; edit only those lines | files: the above where wrong | owner: implementer | verify: `rg -n 'expired|firstPurchaseOnly|perCustomerLimit|cupom' packages/*/AGENTS.md PRODUCT.md` and confirm every hit still matches the shipped behaviour (list them in the step's completion note) | P19
- [x] S20 Update `MEN-97` | goal: ticket body = shipped scope, the six decisions, the settled behaviour contract, and future-spec bullets for RegiÃµes/Requisitos (account older than X days, more than X orders, account created before/after a date, minimum order value) marked future | files: none (Linear) | owner: orchestrator | verify: re-read `MEN-97` with `get_issue` and confirm the four sections exist, the future bullets are labelled future, and the body contains no literal `\n` sequence | P20
- [x] S21 Review docs | goal: docs match code, nothing future described as shipped, no escaped newlines in the ticket | files: `.agents/skills/menuza/**`, edited AGENTS.md / PRODUCT.md | owner: reviewer | verify: `rg -n 'expired' .agents/skills/menuza/features/orders/coupons.md` matches only "derived/never manual" wording; `rg -n 'Em breve|RegiÃµes|Requisitos' .agents/skills/menuza` claims them as future | P21

### Phase 6 â€” verification

- [x] S22 Canonical chain | goal: run in order, report each result | files: none | owner: verifier | verify: `bun run design:check` && `bun run typecheck` && `bun test` && `bun run lint` && `bun run fmt:check` && `bun run build` | P22
- [x] S23 Migrations clean | goal: after S22 is green, `migration status` clean and `db:deploy` idempotent | files: `packages/db/prisma/migrations/*` | owner: verifier | verify: `bunx prisma migration status` && `bun run db:deploy` | P23

## Parallel

- P1: S1
- P3: S3 (needs S1 only for the contract shape, not the DB)
- P5: S5
- P7: S7
- P8: S8
- P10: S10
- P12: S12 (independent of `coupon-form.tsx`)
- P18: S18, S19 (different files)
- P20: S20
- P22: S22

Chains (never same group): S1 â†’ S2 â†’ S5 â†’ S6; S3 â†’ S4; S7 â†’ S8 â†’ S9 (S7 needs S5); S10 â†’ S11 (needs S3 + S5); S12 â†’ S13 â†’ S14 â†’ S15 â†’ S16 â†’ S17 (all but S12 touch `coupon-form.tsx`); S18 â†’ S19 â†’ S21; S20 after S16; S22 after S17 + S21 + S20; S23 after S22.

## Risks / Not doing

- Whole-row update means the form must always send every required field; the picker and both switches must not break that (checked in S6).
- Scope filtering changes the percentage base for scoped coupons only; unscoped coupons keep today's `subtotalCents` result â€” S4 pins both.
- `money.ts` records one redemption per coupon from `AppliedDiscount[]`; if a scoped coupon ends up applying on several lines the aggregation already folds it â€” no change needed, verify in S11.
- Deleting the "Uso Ãºnico por cliente" label is a relabel, not a column drop: `firstPurchaseOnly` stays and its old `perCustomerLimit` coupling is removed. `rg -n 'Uso Ãºnico por cliente|Travado em 1' apps/web packages` must be empty after S14.
- Edit defaults must coerce a stored `expired` to `"disabled"` (S13), or the narrowed write schema rejects the prefill and the form never opens on a legacy row.
- Legacy `expired` rows are only rewritten on save; untouched rows keep the stored value and stay renderable via `effectiveCouponStatus()`.
- Regions/Requirements bullets live only in the plan and `MEN-97`, never in `contract.prisma`.
- Repo may be dirty; touch only coupon files and the docs listed.
- Per-step formatting on touched paths only: `bunx oxfmt <paths>` then `bunx oxlint <paths>` (autofixable spacing rule may need `--fix`); UI steps also `bun run design:check`.
