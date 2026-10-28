# Nutrition label

Status: implemented in the product editor and on the storefront. Linear is the only ticket store — query team `Menuza` for the nutrition ticket; no status is mirrored here.

`PRODUCT.md` §5 (store-configurable nutrition display) and §6 (food information). The regulatory reference is **RDC 429/2020 + IN 75/2020**.

## Scope and legal framing

- The norms regulate nutrition labelling of **packaged foods**: 10 mandatory constituents, order, units, VDR, rounding, reference portion and front-of-pack (the "lupa").
- A dish prepared or fractioned in the establishment is in the **voluntary** list (IN 75 Anexo I). The panel must not imply lab verification: `source` records provenance (`manual`, `lab`, `supplier_label`, `database`, `estimate`) and the lupa help says it is for packaged food, not for a dish prepared on site.
- The label is rendered in the IN 75 vertical or simplified model. Completeness is validated on publish; the store owns the numbers.
- The store can choose not to publish. `published` is the only public gate and the public payload never carries a draft.

## Data model

`ProductNutrition` is one row per product (`productId @unique`), tenant-scoped.

| Field                                                                                                                                       | Meaning                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `basis`                                                                                                                                     | `solid` = per 100 g; `liquid` = per 100 mL           |
| `labelFormat`                                                                                                                               | `vertical` or `simplified`                           |
| `source`, `referenceAt`                                                                                                                     | provenance and reference date                        |
| `energyKcal`, `carbsMg`, `totalSugarsMg`, `addedSugarsMg`, `proteinMg`, `totalFatMg`, `saturatedFatMg`, `transFatMg`, `fiberMg`, `sodiumMg` | per 100 g/mL; energy in kcal, the rest in **mg**     |
| `portionMilli`                                                                                                                              | thousandths of a gram (solid) or millilitre (liquid) |
| `householdMeasure`, `servingsPerPack`                                                                                                       | "2 colheres de sopa", 4                              |
| `showHighAddedSugar`, `showHighSatFat`, `showHighSodium`                                                                                    | the store's explicit lupa choices                    |
| `published`, `notes`, timestamps                                                                                                            | publication, internal notes, read metadata           |

Why integers: same rationale as money in cents (ADR-0006) — no `Decimal` in the read path. mg gives 0.001 g precision; `portionMilli` gives 0.001 g/mL.

Portion, %VD, kJ, rounding and the lupa are **derived, never stored**.

## Calculation rules

Defined once in `packages/shared/src/nutrition/nutrients.ts` and `label.ts`:

- **Mandatory order/indentation:** valor energético, carboidratos, açúcares totais (1st level), açúcares adicionados (2nd), proteínas, gorduras totais, saturadas (1st), trans (1st), fibras, sódio.
- **VDR:** energy 2.000 kcal; carbs 300 g; added sugars 50 g; protein 50 g; total fat 65 g; saturated 20 g; trans 2 g; fiber 25 g; sodium 2.000 mg. Total sugars has **no VDR** and renders `—` in `%VD`.
- **Rounding (Anexo III):** ≥ 10 → integer; 1–10 → 1 decimal (integer when the decimal is 0); < 1 g → 1 decimal; < 1 mg → 2 decimals (1 when the second is 0); energy and %VD → integer.
- **%VD:** `Math.round((rounded portion value / VDR) * 100)`. The quantity is the already-rounded portion value.
- **Energy:** kcal and kJ (`Math.round(kcal * 4.184)`); the cell stacks them on mobile.
- **Non-significant (Anexo IV):** energy ≤ 4 kcal; carbs/sugars/protein/fat/fiber ≤ 0.5 g; saturated/trans ≤ 0.1 g; sodium ≤ 5 mg. A non-significant 100 g value is declared as 0 on every basis.
- **Front-of-pack (Anexo XV):** added sugars ≥ 15 g/100 g (7.5 g/100 mL); saturated ≥ 6 g (3 g); sodium ≥ 600 mg (300 mg). It is evaluated per 100 g/mL, never per portion. The three `showHigh*` switches are the store's choice; the UI shows "Sugerido" when the value reaches the threshold, but never publishes the claim by itself.
- **Portion (Anexo V):** the UI accepts the store's portion and household measure; it does not hard-code the reference table. The Anexo V table is guidance, not an enforced database.

## Formats

- **Vertical:** all constituents, with 100 g/mL, the declared portion and `%VD`.
- **Simplified (Anexo X):** non-significant constituents leave the grid and are named in the sentence below it ("Não contém quantidades significativas de …"). If every constituent is non-significant, only the sentence is rendered.
- **Redundant portion rule (RDC 429 Art. 9º):** when the declared portion is 100 g (or 100 mL), the second column is omitted so the table does not display duplicate 100 g columns.
- Horizontal, broken, linear and aggregate models are **not** implemented.

## UI

### Dashboard

- Tab order: **Produto → Tabela nutricional → SEO → Desempenho**. The tab lives in `?tab=nutricao` (nuqs, shallow) and stays mounted so unsaved input survives a switch.
- The form is independent from `ProductForm`: own `<form>`, own TanStack Form, own baseline and partial patch. The product patch still cannot carry nutrition.
- Cards: base + portion; the 10 nutrients; format + lupa; publication + source + notes. Each nutrient shows the portion value and `%VD` live.
- Preview: sticky on desktop, below the form on mobile; modes **Porção / 100 g / Personalizada**. The custom amount is a simulation and says so in the footnote.
- Publish is disabled while the label is incomplete. The server revalidates the **merged** row: all 10 nutrients, portion > 0, servings ≥ 1 and a non-empty household measure. `referenceAt` is supported by the API/DB but is not editable in the form yet.
- The dirty guard has a third section, `nutrition`; "Tabela nutricional" joins the pending-changes label.

### Storefront

- Only published and complete labels render. The block sits between the description and "Opções e preços" on `/menu/[productId]`.
- The label is a server component; the official view is the portion. The card also shows the source and `referenceAt ?? updatedAt`.
- The public payload never carries `published`, `tenantId`, `productId` or `notes`; `listMenu` stays lean and does not include nutrition.

### Mobile

- The ANVISA table is `table-fixed` with explicit column widths; the constituent column wraps and the numeric columns stay narrow. At 375 px the four columns fit without a horizontal scroll.
- Energy stacks `kcal` over `kJ` instead of forcing a wide column.
- The product tab strip scrolls horizontally in a wrapper with bottom padding and `overflow-y-hidden`; do **not** put `overflow-x-auto` back on `TabsList` itself (the 5 px indicator triggers a vertical scrollbar).
- The preview is not sticky on mobile; the header is. Check 375 px and 1280 px.

## API

- `panel.getProduct` includes `nutrition` (nullable); no extra read. `createProduct`/`updateProduct` return the same detail.
- `panel.saveProductNutrition` is a partial `PUT` (`/panel/stores/{storeSlug}/products/{productId}/nutrition`): omitted = keep, `null` = clear. It returns the full `PanelProductDetail`.
- Public `getProduct` returns `PublicProductDetailSchema` with `nutrition` only when `published`; `toPublicNutrition` gates again in the mapper.
- Tenant-scoped writes use `create` or `where({ tenantId, productId }).updateAll(...)` (Prisma 8 RC.17 drops the tenant predicate from `update`).
- `ProductNutrition` has `tenantId`, so the isolation guard covers it automatically; the pinned isolation test includes it.

## Code entry points

| Layer                           | Path                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pure calculations + label model | `packages/shared/src/nutrition/{nutrients,label}.ts`; tests in `label.test.ts`                   |
| Contracts                       | `packages/shared/src/panel/contracts.ts`, `packages/shared/src/commerce/contract.ts`             |
| DB                              | `packages/db/prisma/contract.prisma`; migration `20261024T1608_product_nutrition`                |
| Panel API                       | `packages/api-tenant/.../panel/saveProductNutrition.impl.ts`, `catalog.ts`, `router.ts`          |
| Public API                      | `packages/api-commerce/.../public/support.ts`, `getProduct.impl.ts`                              |
| Dashboard                       | `apps/web/.../[productId]/product-nutrition.tsx`, `product-tabs.tsx`, `product-editor-guard.tsx` |
| Shared renderer                 | `apps/web/src/components/nutrition/nutrition-label.tsx`                                          |
| Storefront                      | `apps/web/src/app/(storefront)/menu/[productId]/page.tsx`, `_lib/storefront-data.ts`             |

## Checks

- `bun test` covers the Anexo III bands, %VD, kJ, non-significant values, the three lupa thresholds at the boundary, the simplified sentence and missing fields (`packages/shared/src/nutrition/label.test.ts`).
- `packages/api-tenant/test/catalog.test.ts`: getProduct carries nutrition; first save creates; partial merge keeps; `null` clears; unknown/foreign product → `NOT_FOUND`; published incomplete → `VALIDATION_FAILED`.
- `packages/api-commerce/test/public-support.test.ts`: unpublished/missing → `null`; the public object ships only the contract fields.
- `packages/db/test/tenantIsolation.test.ts`: a nutrition query without `where.tenantId` fails closed.
- `bun run design:check`, `bun run typecheck`, `bun run lint`, `bun run fmt:check`, `bun run build`.
- Manual: 375 px and 1280 px; the 4-column label does not overflow; the tab strip has no vertical scrollbar; publishing an incomplete label is refused; an unpublished label does not appear on the storefront; %VD is not persisted.

## Known limits / follow-ups

- Nutrition is **per product**, not per variation (300 g / 500 g variants inherit the product label).
- Allergens, gluten and lactose are **not** in this tab; they are separate labelling duties (RDC 727/2022, Lei 10.674/2003).
- No import from label photo/OCR, TACO/TBCA, spreadsheets or supplier data.
- No horizontal/broken/linear/aggregate layouts, no export/print image.
- `referenceAt` is not editable in the form yet.
- No explicit "official vs informative" mode: `source` records provenance and publication requires completeness; the UI still warns that the lupa is for packaged food.
- Custom amount is a **preview** view; the storefront always renders the official portion (+ 100 g/mL).

## Contributor notes

- The shared `buildNutritionLabel` model is the only input to both preview and storefront. Never reimplement rounding, %VD or lupa in a component.
- A new nutrient needs: a `NUTRIENTS` row with VDR/non-significant ceiling, the panel/commerce schemas, the DB column + CHECK, the form field, and the shared tests.
- Follow the `shadcn` + `menuza` skills for dashboard changes; run `design:check` and check 375 px before calling it done.
