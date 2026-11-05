# Catalog, kits and stock

`PRODUCT.md` §6–§8. Tickets: MEN-80 produtos/variacoes, MEN-81 estoque, MEN-82 kits, MEN-83 baixa de componentes.

## Products (`PRODUCT.md` §6)

- Types named: fresh marmita, frozen marmita, dessert, complement. Required: name, description, photo, price.
- Variations (e.g. weight/size, protein); each variation can carry its own price and stock.
- Photos, galleries and videos chosen by the store; limits open. Optional complements (free or paid), configured per product — quantity/selection rules still to detail.
- Food info: the nutrition label is implemented in `nutrition.md` — per 100 g/mL, portion, %VD, vertical/simplified and the packaged-food lupa. `source` records provenance and `published` is gated on completeness. Validity, storage and preparation may be provided by the store. No separate engine just because food is fresh or frozen. Allergens/cross-contamination remain open and live outside this tab.
- Store-level configuration does not remove legal product duties.

## Nutrition label (`nutrition.md`)

- The 10 mandatory constituents of RDC 429/2020 + IN 75/2020, stored per 100 g/mL as integer kcal/mg; the declared portion is in thousandths.
- %VD, kJ, Anexo III rounding, Anexo IV non-significant values and the Anexo XV lupa are derived in `@menuza/shared/nutrition`, never persisted.
- The editor renders **vertical** or **simplified**; the lupa has three independent switches (Açúcar adicionado, Gordura saturada, Sódio), each with a `?` explaining its threshold and the packaged-food caveat.
- Scope caveat: the norms cover packaged food; a dish prepared in the establishment is voluntary. Never present the label as lab-verified.

## Kits (`PRODUCT.md` §7, MEN-82/MEN-83)

The "a partir" mode was discarded (MEN-159). Three kinds, one `kind` column:

1. **`fixed`** — the store locks a quantity per dish; the buyer picks nothing but changes of variation when allowed.
2. **`custom_quantities`** — the store sets `minQty`/`maxQty`/`step` per dish.
3. **`fixed_total`** — only the kit total is locked (`minItems`/`maxItems`); per-dish bounds are optional.

A kit may carry `KitGroup` sections, each with its own `minItems`/`maxItems`; a dish outside a group falls into the default group, which has no bounds. A group with no dish is refused at save.

Price resolves in this order, on the server:

1. `pricingMode = fixed` charges `baseCents`; `sum` charges `max(baseCents, Σ chosen variations)`, so `baseCents` is a floor.
2. The kit `percentOff` (0–100) applies to that total.
3. `KitDiscountBand` applies last, by how many of that kit the order carries — bands are not cumulative and the highest reached band wins.

Variations are locked to the manager's choice. `allowSwap` per dish opens only the variations the manager listed in `KitItemVariation`. A sold-out dish stays visible and blocked; when the composition can no longer reach its own minimums the kit obeys `unavailableBehavior` (`hide` drops it, `block` keeps it disabled). **Configuration must never let a composition violate its own minimums.** `maxKitsPerOrder` is optional. The price is recalculated at payment time; there is no price lock between composition and checkout.

Coupons reach kits through `CouponKit`, mirroring the product scope. `couponStackable` (default on) decides whether a coupon touches a kit line.

Out of scope: kit inside a kit, per-kit SEO (MEN-233), kit templates (MEN-121 duplicate), complements of a kit (the checkout reserves the hook; UI lands with the product complements).

## Stock (`PRODUCT.md` §8)

- Controlled or unlimited per product/variation. Controlled must block overselling; unlimited imposes no artificial balance.
- With variations, define precedence between product-level and variation-level config.
- Reservation moment is configurable (options/default open). Reservation, expiry, payment and write-off must together prevent selling the same last unit concurrently.
- Reservation window is not automatically the Pix validity window.
- **Kits discount the chosen variations of their components** (this supersedes per-kit stock) — MEN-83.
- No production, capacity, ingredients, lots or operational validity in the MVP. Alerts/labels/reports open.

## Code entry points

- Schema `Category`, `Product`, `Variation`, `Kit`, `KitItem`, `ProductNutrition` is `crates/persistence/migrations/0001_baseline.sql`; kits grew `KitGroup`, `KitItemVariation`, `KitDiscountBand`, `CouponKit` in `0003_kits.sql` — all tenant-scoped, money as integer cents (ADR-0006), enum-ish columns as `text` + CHECK with ASCII slugs (`pt-BR` labels only in the UI). The Prisma contract and migrations under `packages/db/` are a historical record only.
- All SQL lives in `crates/persistence`: `src/tenant/panel/products.rs`, `categories.rs`, `kits.rs`. Panel handlers are `crates/api-tenant/src/domains/tenant/subdomains/panel/` (`:3002`); contract DTOs are `crates/contract`.
- Reads `panel.listProducts`, `panel.listCategories`, `panel.getProduct` (includes the nullable `nutrition`) as REST routes under the panel subdomain; the commerce side owns the buyer catalog (`crates/api-commerce`, generated into `apps/web/src/lib/api/commerce.ts` via orval).
- Panel UI: `apps/web/src/routes/dashboard/$storeSlug/catalog/products/`, components in `apps/web/src/features/catalog/`.
  - `index.tsx` parses `q`/`status`/`category`/`department`/`tag`/`page` **server-side** (`features/catalog/schemas/product-search.ts`, `nuqs` `createLoader`) and filters the single `panel.listProducts` payload in `features/catalog/lib/product-filter.ts`. Order is `sortOrder` asc → name; `sortOrder` is on `PanelProductSchema`.
  - `features/catalog/components/products-table.tsx` owns the URL toolbar (`useQueryStates`, shallow, debounced text) and resets `page` on filter changes. In the tree view (`view=tree`), products within each category can be reordered with up/down arrows updating `sortOrder`.
  - `export.ts` is the server CSV export: same parser/filter, `text/csv`, UTF-8 BOM, `private, no-store`.
  - `$productId.tsx` keeps Produto, Tabela nutricional and SEO mounted through `features/catalog/components/product-tabs.tsx`; `?tab=seo`/`?tab=nutricao` are shallow. `features/catalog/components/product-form.tsx`, `seo/seo-form.tsx` and `product-nutrition.tsx` send **partial** patches (omitted = keep, `null` = clear/inherit; an empty diff makes no request); `MoneyInput` formats cents live while typing and the nutrition form converts grams to mg only at the payload boundary. The "Ordem" input is omitted from the product form (managed via the tree view).
  - `seo-form.tsx` renders form fields alongside `seo/seo-preview-card.tsx` (real-time previews for Google Search SERP, Social/Open Graph card, and structured JSON-LD). `seo/json-ld/json-ld-editor.tsx` provides TanStack Highlight syntax highlighting with auto-wrap, tab indentation, and synchronized scroll.
  - Kit editor: `features/catalog/components/kit-form.tsx` (three tabs: identidade, composição & regras, preço), `kit-items-editor.tsx` (one card per group plus a `Pratos sem grupo` card, limit fields per kind) and `kit-preview.tsx`; `product-combobox.tsx` is the searchable catalog picker (thumbnail, category, availability, starting price). `features/catalog/schemas/kit.ts` mirrors the Rust `validate()` and `features/catalog/lib/kit-price.ts` resolves the price; `apps/web/tests/kit-price.test.ts` covers the three steps. Routes `catalog/kits/{index,new,$kitId}.tsx`; the picker uses `panel.listKits` options (`GET /panel/stores/{storeSlug}/kit-options`, which carries `imageUrl` and `categoryName`). Editor layout and cross-feature rules: `kits.md` and `apps/web/DESIGN.md`.
  - `product-nutrition.tsx` is the nutrition island: base/portion, 10 nutrients, vertical/simplified, the three lupa switches, publication and a live preview. `apps/web/src/components/nutrition/nutrition-label.tsx` is the shared renderer used by the preview and the storefront; 100 g portions omit the duplicate second column per RDC 429 Art. 9º.
- `panel.updateProduct` / `panel.saveSeo` accept partial input (`UpdateProductInputSchema`, `SaveSeoInputSchema` in `packages/shared/src/tenant/index.ts`); create stays fully required.
- Tenant guard: every tenant-scoped statement in `crates/persistence` binds `tenantId` through `TenantScope`; a query without a tenant fails closed (`crates/persistence/tests/tenant_guard.rs`). There is no Prisma predicate to drop anymore.

## Checks

- Two concurrent purchases never consume the same last controlled unit. → `../engineering/checks.md` scenario 3.
- A kit cannot be composed past its minimums even when a dish is sold out, and a `hide` kit disappears from the storefront while a `block` kit stays disabled.
- A kit respects its minimums/maximums and discounts exactly its components. → scenario 4.
- The kit editor stays at three tabs with one card per group and rules inside composition (`kits.md` → Editor layout; `apps/web/DESIGN.md` → Composition editors).
- A nutrition label publishes only when complete, never leaks before `published`, and its %VD/lupa agree between panel and storefront (`nutrition.md`).
- At 375 px the label table fits without horizontal overflow and the product tab strip has no vertical scrollbar (`nutrition.md` → Mobile).
