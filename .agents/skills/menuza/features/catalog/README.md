# Catalog, kits and stock

`PRODUCT.md` §6–§8. Tickets: MEN-80 produtos/variacoes, MEN-81 estoque, MEN-82 kits, MEN-83 baixa de componentes.

## Products (`PRODUCT.md` §6)

- Types named: fresh marmita, frozen marmita, dessert, complement. Required: name, description, photo, price.
- Variations (e.g. weight/size, protein); each variation can carry its own price and stock.
- Photos, galleries and videos chosen by the store; limits open. Optional complements (free or paid), configured per product — quantity/selection rules still to detail.
- Food info: nutritional per 100g and per portion was **proposed but needs regulatory review**; validity, storage and preparation may be provided by the store. No separate engine just because food is fresh or frozen. Allergens/cross-contamination open.
- Store-level configuration does not remove legal product duties.

## Kits (`PRODUCT.md` §7)

Two modes (the "a partir" mode was discarded — MEN-159):

1. **Pre-selected** — the store defines the product group and composition; buyer substitution rules open.
2. **Build-your-own** — eligible-product list set by the store, with optional subgroups; the store toggles availability.

Common rules: several active kits per store; fixed and free sizes; minimums/maximums for kit count, units per product and total items; product repetition allowed within the limit; configurable price (formulas open); progressive discount by quantity; coupon/kit-discount accumulation configurable per store/campaign; unavailable items marked out-of-stock or hidden per config. **Configuration must never let a composition violate its own minimums.** No reusable kit templates in the MVP.

## Stock (`PRODUCT.md` §8)

- Controlled or unlimited per product/variation. Controlled must block overselling; unlimited imposes no artificial balance.
- With variations, define precedence between product-level and variation-level config.
- Reservation moment is configurable (options/default open). Reservation, expiry, payment and write-off must together prevent selling the same last unit concurrently.
- Reservation window is not automatically the Pix validity window.
- **Kits discount the chosen variations of their components** (this supersedes per-kit stock) — MEN-83.
- No production, capacity, ingredients, lots or operational validity in the MVP. Alerts/labels/reports open.

## Code entry points

- Models `Category`, `Product`, `Variation`, `Kit`, `KitItem` (`packages/db`) — all tenant-scoped, money as `Int` cents (ADR-0006), enum-ish columns as `text` + CHECK with ASCII slugs (`pt-BR` labels only in the UI).
- Reads `panel.listProducts`, `panel.listCategories`; commerce side owns the buyer catalog.
- Panel UI: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/`.
  - `page.tsx` parses `q`/`status`/`category`/`department`/`tag`/`page` **server-side** (`product-search-params.ts`, `nuqs` `createLoader`) and filters the single `panel.listProducts` payload in `product-filter.ts`. Order is `sortOrder` asc → name → id; `sortOrder` is on `PanelProductSchema`.
  - `products-table.tsx` owns the URL toolbar (`useQueryStates`, shallow, debounced text) and resets `page` on filter changes.
  - `export/route.ts` is the server CSV export: same parser/filter, `text/csv`, UTF-8 BOM, `private, no-store`.
  - `[productId]/product-tabs.tsx` keeps Produto and SEO mounted; `?tab=seo` is shallow. `product-form.tsx` and `_components/seo-form.tsx` send **partial** patches (omitted = keep, `null` = clear/inherit; an empty diff makes no request), and `MoneyInput` formats cents live while typing.
- `panel.updateProduct` / `panel.saveSeo` accept partial input (`UpdateProductInputSchema`, `SaveSeoInputSchema`); create stays fully required.
- Prisma 8 RC.17 pitfall: `update`/`delete` by `{ tenantId, id }` compile without the `tenantId` predicate; the isolation guard rejects them. Tenant-scoped writes by id use `updateAll`/`deleteAll` (and `updateAndCount` for counts); `upsert` with `conflictOn` is fine.

## Checks

- Two concurrent purchases never consume the same last controlled unit. → `../engineering/checks.md` scenario 3.
- A kit respects its minimums/maximums and discounts exactly its components. → scenario 4.
