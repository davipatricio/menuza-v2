# Rebuild the catalog as Department > Category > Subcategory > Product, with sortable, editable taxonomy screens

Status: active
Updated: S0

## Non-goals

- No storefront routes for departments/categories/subcategories (`/menu` only).
- No bulk delete/detach of departments beyond `moveProductsToCategoryId`.
- No subcategory SEO (`SeoEntityType` keeps `store|department|category|tag|product|kit|coupon`).
- No tags UX, no kits, no orders/payments/worker changes, no pagination.

## Assumptions

- verified: `CONFLICT` is in `sharedErrorCodes` (`packages/shared/src/errors/index.ts:23`), so `panelRead`/`sessionContract` already declare it; `catalogConflict()` needs no contract change.
- verified: `Timestamp(3)` decodes as `Temporal.PlainDateTime` (`packages/db/AGENTS.md`); `toPlainDateTime`/`isoOf` exist **only** in `packages/api-commerce/src/domains/commerce/support.ts:113-129` — `@menuza/api-tenant` has no copy, so S6 adds one.
- verified: `Department` has no `sortOrder` (dropped in `20261023T0224_add_department_active`); do not offer `sortBy: sortOrder` for departments.
- verified: taxonomy writes answer `PanelSuccessOutputSchema` (`{success}`), never the created id.
- verified: `catalog/products/export/route.ts` calls `filterProducts` with the same `productSearchParams`, so URL-key changes must stay compatible.
- verified: `apps/web/src/app/(storefront)/_lib/storefront-data.ts#menuProducts` reads `menu.categories`; it changes with `publicMenuOutput`.
- verified: `catalog/catalog-tabs.tsx` has zero importers.
- unverified: no consumer of `panel.list*`/`panel.update*` outside the dashboard catalog pages (repo grep, not exhaustive).

## Code map

- `packages/db/prisma/contract.prisma` — Tenant L4-35, Category L302-314, Department L319-332, Tag L334-346, Product L348-371, ProductTag L401-411.
- `packages/db/migrations/app/<ts>_<name>/migration.ts` + `migrations/snapshots/<hash>/` + `migrations/app/refs/db.json`; rawSql precedent `20261018T2152_order_status_axes_wallet_seo/migration.ts:47-90`.
- `packages/db/prisma/seed.ts:229-294` — 3 categories, no departments.
- `packages/shared/src/panel/contracts.ts` — PanelProductSchema L357, PanelProductListSchema L377, PanelProductDetailSchema L407, PanelCategorySchema L606, PanelDepartmentSchema L628, PanelTagSchema L639, writes L655-711, procedures L1122-1366, `panelRead` L952.
- `packages/shared/src/commerce/contract.ts:57-98` — `PublicProductSchema`, `publicMenuOutput`; `getProduct` L144.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/` — `catalog.ts` (CatalogTx, loadProduct, toProductDetail, assertOwnedIds), `support.ts` (resolveStore/inTenantScope/requireCapability), `router.ts:43-85`, `list|create|update|delete{Product,Department,Category,Tag}.impl.ts`, `bulkUpdateProducts.impl.ts`, `listSeoEntities.impl.ts`.
- `packages/api-commerce/src/domains/commerce/subdomains/public/{listMenu,listSitemap,getProduct}.impl.ts`, `public/support.ts:22` (`toIsoTimestamp`), `public/support.ts#toPublicProduct`.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/` — `products/{page,products-table,product-filter,product-search-params,product-form,product-taxonomy,taxonomy-combobox,export/route}.tsx|ts`, `departments/{page,departments-table}.tsx`, `categories/{page,categories-table}.tsx`, `tags/tags-table.tsx`, `_components/taxonomy-dialog.tsx`, `catalog-tabs.tsx` (dead), `loading.tsx`.
- `apps/web/src/components/ui/data-table.tsx:69-96,306-492` — `rowHref`, `hideToolbar`, `tableLabel`.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/{store-breadcrumb,app-sidebar}.tsx`; `apps/web/src/lib/format.ts:137` (`formatDateTime`).
- `apps/web/src/app/(storefront)/_lib/storefront-data.ts`, `apps/web/src/app/(storefront)/menu/page.tsx:160-196`.
- Tests: `packages/api-tenant/test/{catalog,panelReads}.test.ts`, `apps/orpc-server/test/openapi.test.ts`, `apps/web/tests/product-filter.test.ts`.

## Shapes, procedures, URL keys, copy

### DB (S1)

- `Category`: `+ active Boolean @default(true)`, `+ updatedAt Timestamp(3) @default(now())`, `+ subcategories Subcategory[]`, `+ departments CategoryDepartment[]`, `- products Product[]`.
- `Department`: `+ updatedAt Timestamp(3) @default(now())`, `+ categories CategoryDepartment[]`, `- products Product[]`.
- `Subcategory`: `id, tenantId, categoryId, name, sortOrder Int @default(0), active Boolean @default(true), updatedAt Timestamp(3) @default(now())`; `tenant` (Cascade), `category` (Cascade), `products Product[]`; `@@unique([categoryId, name], map: "Subcategory_categoryId_name_key")`, `@@index([tenantId], map: "Subcategory_tenantId_idx")`, `@@index([categoryId], map: "Subcategory_categoryId_idx")`, `@@map("Subcategory")`.
- `CategoryDepartment`: `categoryId, departmentId` only, both relations Cascade — exact `ProductTag` shape (composite `@@id`, `@@index([departmentId])`, `@@map("CategoryDepartment")`).
- `Product`: `- categoryId - departmentId - category - department`, `+ subcategoryId String?`, `+ subcategory Subcategory? @relation(..., onDelete: SetNull)`, `+ updatedAt Timestamp(3) @default(now())`, `- @@index([categoryId])`, `+ @@index([subcategoryId], map: "Product_subcategoryId_idx")`.
- `Tag`: `+ updatedAt Timestamp(3) @default(now())`.
- `Tenant`: `+ subcategories Subcategory[]` (Prisma requires both sides).

### Panel contracts (S4)

- `PanelDepartmentSchema` = `{ id, name, active, itemsCount, updatedAt: isoTimestamp }`.
- `PanelCategorySchema` = `{ id, name, active, sortOrder, itemsCount, updatedAt, departmentIds: string[], departmentNames: string[] }`.
- `PanelSubcategorySchema` = `{ id, name, categoryId, categoryName, active, sortOrder, itemsCount, updatedAt }`.
- `PanelProductSchema`: drop `departmentId`/`departmentName`; add `subcategoryId|null`, `subcategoryName|null`, `departmentIds: string[]`, `departmentNames: string[]`, `updatedAt`. `categoryId`/`categoryName` stay (derived, read-only). `PanelProductDetailSchema` inherits the same entries.
- List inputs (all keys optional, so current callers keep validating):
  - `ListDepartmentsInputSchema` = `{ storeSlug, q, status: all|active|inactive, sortBy: name|itemsCount|updatedAt (default name), order: asc|desc (default asc) }`.
  - `ListCategoriesInputSchema` = same + `departmentId` (empty = all), `sortBy: name|itemsCount|updatedAt|sortOrder` (default `sortOrder`).
  - `ListSubcategoriesInputSchema` = same + `categoryId` (empty = all), `sortBy: name|itemsCount|updatedAt|sortOrder` (default `sortOrder`).
- Writes: `CreateCategoryInputSchema` `+ active, + departmentIds: string[]`; `UpdateCategoryInputSchema` = spread (full replace, existing pattern) `+ categoryId`; `UpdateDepartmentInputSchema` `+ moveProductsToCategoryId?: string|null`; new `CreateSubcategoryInputSchema { storeSlug, name, categoryId, sortOrder, active }`, `UpdateSubcategoryInputSchema` (spread + `subcategoryId`), `DeleteSubcategoryInputSchema { storeSlug, subcategoryId }`.
- Product writes: `CreateProductInputSchema`/`UpdateProductInputSchema`/`BulkUpdateProductsInputSchema` swap `categoryId`/`departmentId` for `subcategoryId` (`null` clears).
- New procedures (openapi meta, `tags: ["panel"]`): `listSubcategories` GET `/panel/stores/{storeSlug}/subcategories` (`listPanelSubcategories`), `createSubcategory` POST same (`createPanelSubcategory`), `updateSubcategory` PUT `/subcategories/{subcategoryId}` (`updatePanelSubcategory`), `deleteSubcategory` DELETE same (`deletePanelSubcategory`).

### Commerce (S5)

- `publicMenuOutput` = `{ departments: { id, name, categories: { id, name, sortOrder, subcategories: { id, name, sortOrder, products: PublicProductSchema[] }[] }[] }[], uncategorized: PublicProductSchema[] }`. Departments are ordered by `name` asc (no `sortOrder` column); categories/subcategories by `sortOrder` then `name`.
- `listSitemap`: add `active: true` to the `Department` **and** `Category` queries (`listSitemap.impl.ts:30-33`). Subcategories publish nothing (no route).

### Dashboard URL keys (nuqs)

- Shared keys every taxonomy table writes: `q`, `status` (`all|active|inactive`), `sort`, `order` (`asc|desc`).
- Departments: `sort` ∈ `name|itemsCount|updatedAt` (default `name`).
- Categories: `sort` ∈ `name|itemsCount|updatedAt|sortOrder` (default `sortOrder`), plus `department` (id, empty = all).
- Subcategories: `sort` ∈ `name|itemsCount|updatedAt|sortOrder` (default `sortOrder`), plus `category` (id, empty = all).
- Products keep `q,status,visibility,category,department,tags,view,priced,untagged` and gain nothing.

### Copy (pt-BR, exact)

- Department deactivation with products — dialog title `Desativar departamento?`; description `${count} ${count === 1 ? "produto está" : "produtos estão"} em categorias deste departamento. Escolha uma categoria de destino para movê-los antes de desativar.`; field label `Mover produtos para`; placeholder `Selecione uma categoria`; empty list `Nenhuma categoria fora deste departamento. Crie uma categoria em outro departamento para continuar.`; confirm `Mover e desativar`; cancel `Cancelar`; inline error title `Não foi possível desativar`.
- Server messages: `Este departamento tem ${n} produtos. Escolha uma categoria de destino para movê-los.`; `Escolha uma categoria que não pertença a este departamento.`; `Categoria de destino não encontrada.`; `Desvincule as categorias deste departamento antes de excluí-lo.`; `Esta subcategoria ainda tem produtos. Mova os produtos antes de excluí-la.`
- Row switches: `aria-label` = `${active ? "Desativar" : "Ativar"} departamento ${name}` (same for categoria/subcategoria).
- Row click opens the edit dialog; the name cell is a `<button>` labelled `Editar departamento ${name}`.
- Products column header: `Última edição`.

## Steps

### Phase 0 — data (sequential gate G1)

- [ ] S1 Extend the contract: Category/Department/Tag/Product changes, new Subcategory + CategoryDepartment, Tenant relation | files: `packages/db/prisma/contract.prisma` | owner: implementer | verify: `bun run db:generate` | P0
- [ ] S2 Generate the package with `bun run db:migrate`, then hand-insert three `rawSql` blocks between the `createTable`/`addColumn` ops and the first `Product` `dropColumn`: (a) one `Geral` Subcategory per Category, `id = md5('geral:' || "Category"."id")`, `ON CONFLICT ("id") DO NOTHING`; (b) `UPDATE "Product" p SET "subcategoryId" = s."id" FROM "Subcategory" s WHERE s."categoryId" = p."categoryId" AND s."name" = 'Geral'`; (c) inferred `CategoryDepartment` rows `SELECT DISTINCT "categoryId","departmentId" FROM "Product" WHERE both NOT NULL`, `ON CONFLICT ("categoryId","departmentId") DO NOTHING`. Postchecks assert the invariants (every Category has exactly one `Geral`; no Product has `categoryId` without `subcategoryId`); prechecks only assert the tables exist, never row counts | files: `packages/db/migrations/app/<ts>_catalog_subcategories/migration.ts`, `packages/db/migrations/snapshots/<hash>/**`, `packages/db/migrations/app/refs/db.json` | owner: implementer | verify: `bun run infra:up && bun run db:deploy` | P0
- [ ] S3 Seed the 3 levels: two departments (`Cozinha` → `Marmitas`, `Bebidas`; `Doces` → `Sobremesas`), one `Geral` subcategory per category, products point at `subcategoryId` | files: `packages/db/prisma/seed.ts:229-294` | owner: implementer | verify: `bun run --filter '@menuza/db' db:seed` | P0

`G1` (gate): `bun run db:generate && bun run --filter '@menuza/db' db:verify` green (the S2 postchecks already ran during `db:deploy`).

### Phase 1 — shared contracts (typecheck stays red until S12)

- [ ] S4 Panel contracts per "Shapes" above: read schemas gain `active/sortOrder/updatedAt/departmentIds`, product row loses `departmentId`, list inputs gain `q/status/sortBy/order`, writes gain `active/departmentIds/moveProductsToCategoryId`, add 4 subcategory procedures | files: `packages/shared/src/panel/contracts.ts`, `packages/shared/src/panel/index.ts` (only if it re-exports names) | owner: implementer | verify: `bunx oxfmt packages/shared/src/panel/contracts.ts && bunx oxlint packages/shared/src/panel/contracts.ts` | P1
- [ ] S5 Nested `publicMenuOutput` + `active` filters documented for sitemap | files: `packages/shared/src/commerce/contract.ts:77-98` | owner: implementer | verify: `bunx oxfmt packages/shared/src/commerce/contract.ts && bunx oxlint packages/shared/src/commerce/contract.ts` | P1

### Phase 2 — API

- [ ] S6 Catalog plumbing: `toPlainDateTime`/`isoOf` helpers, `generalSubcategoryName`, `ensureGeneralSubcategory(tx, tenantId, categoryId)`, `linkedCategoryIds`, `departmentProductCount`, `moveProductsToGeneral`; update `loadProduct`/`toProductDetail`/`assertOwnedIds` to `subcategory` | files: `packages/api-tenant/src/domains/tenant/subdomains/panel/taxonomy.ts` (new), `packages/api-tenant/src/domains/tenant/subdomains/panel/catalog.ts` | owner: implementer | verify: `bunx oxfmt packages/api-tenant/src/domains/tenant/subdomains/panel/catalog.ts packages/api-tenant/src/domains/tenant/subdomains/panel/taxonomy.ts && bunx oxlint packages/api-tenant/src/domains/tenant/subdomains/panel/catalog.ts packages/api-tenant/src/domains/tenant/subdomains/panel/taxonomy.ts` | P2
- [ ] S7 Departments: SQL `orderBy` from `sortBy/order`, `q/status` filters, counts via subcategory→category→department, `updatedAt` on every write, `moveProductsToCategoryId` transaction (CONFLICT cases from "Copy"), delete guard on linked categories | files: `panel/{listDepartments,createDepartment,updateDepartment,deleteDepartment}.impl.ts` | owner: implementer | verify: `bunx oxfmt packages/api-tenant/src/domains/tenant/subdomains/panel/listDepartments.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createDepartment.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateDepartment.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteDepartment.impl.ts && bunx oxlint packages/api-tenant/src/domains/tenant/subdomains/panel/listDepartments.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createDepartment.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateDepartment.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteDepartment.impl.ts` | P3
- [ ] S8 Categories + subcategories: category reads (`departmentIds`, counts through subcategories, `departmentId` filter), category writes replace `CategoryDepartment` set inside `db.transaction`, delete guard through subcategories; 4 new subcategory impls; wire all 8 into the router | files: `panel/{listCategories,createCategory,updateCategory,deleteCategory,listSubcategories,createSubcategory,updateSubcategory,deleteSubcategory}.impl.ts`, `panel/router.ts:60-72` | owner: implementer | verify: `bunx oxfmt packages/api-tenant/src/domains/tenant/subdomains/panel/listCategories.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createCategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateCategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteCategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/listSubcategories.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createSubcategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateSubcategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteSubcategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts && bunx oxlint packages/api-tenant/src/domains/tenant/subdomains/panel/listCategories.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createCategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateCategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteCategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/listSubcategories.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createSubcategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateSubcategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteSubcategory.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts` | P3
- [ ] S9 Products: list rows carry subcategory/category/departments/`updatedAt` (3 queries, no deep include), writes take `subcategoryId` and set `updatedAt`, bulk update takes `subcategoryId` | files: `panel/{listProducts,createProduct,updateProduct,deleteProduct,bulkUpdateProducts}.impl.ts` | owner: implementer | verify: `bunx oxfmt packages/api-tenant/src/domains/tenant/subdomains/panel/listProducts.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createProduct.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateProduct.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteProduct.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/bulkUpdateProducts.impl.ts && bunx oxlint packages/api-tenant/src/domains/tenant/subdomains/panel/listProducts.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/createProduct.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/updateProduct.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/deleteProduct.impl.ts packages/api-tenant/src/domains/tenant/subdomains/panel/bulkUpdateProducts.impl.ts` | P3
- [ ] S10 Commerce: `listMenu` groups department → category → subcategory, filters inactive at all three levels and drops empty groups; `listSitemap` filters `active` | files: `packages/api-commerce/src/domains/commerce/subdomains/public/listMenu.impl.ts`, `packages/api-commerce/src/domains/commerce/subdomains/public/listSitemap.impl.ts` | owner: implementer | verify: `bunx oxfmt packages/api-commerce/src/domains/commerce/subdomains/public/listMenu.impl.ts packages/api-commerce/src/domains/commerce/subdomains/public/listSitemap.impl.ts && bunx oxlint packages/api-commerce/src/domains/commerce/subdomains/public/listMenu.impl.ts packages/api-commerce/src/domains/commerce/subdomains/public/listSitemap.impl.ts` | P3

### Phase 3 — tests (gate G2)

- [ ] S11 Adapt the fake-ORM fixtures: add `Subcategory`/`CategoryDepartment` models, drop `Product.categoryId/departmentId`, add `subcategoryId`/`updatedAt`, update `productInput()` and the category/department assertions; add the 4 subcategory routes to the OpenAPI route table | files: `packages/api-tenant/test/{catalog,panelReads}.test.ts`, `apps/orpc-server/test/openapi.test.ts` | owner: implementer | verify: `bun test packages/api-tenant/test/catalog.test.ts packages/api-tenant/test/panelReads.test.ts apps/orpc-server/test/openapi.test.ts` | P4
- [ ] S12 Gate G2: `bun run typecheck && bun test` | owner: verifier | verify: `bun run typecheck && bun test` | P4

### Phase 4 — dashboard (after G2)

- [ ] S13 Products: `Última edição` column (`formatDateTime(row.updatedAt)`, `meta: { width: 160 }`, non-sortable — product ordering stays `sortOrder`) | files: `catalog/products/products-table.tsx` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/products-table.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/products-table.tsx"` | P5
- [ ] S14 Refactor `_components/taxonomy-dialog.tsx`: entity union `category|department|subcategory|tag`, export `TaxonomyFormDialog`, `TaxonomyDeleteDialog`, and keep `TaxonomyRowActions` (delete-only) with its current props so `tags-table.tsx` compiles untouched; add the "move products" dialog (Select over categories whose `departmentIds` exclude this department) | files: `catalog/_components/taxonomy-dialog.tsx` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/_components" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/_components"` | P5
- [ ] S15 Products subcategory plumbing: URL keeps `category`/`department` and adds `subcategory`; `product-filter.ts` filters by `subcategoryId`, haystack adds `subcategoryName`, `buildProductTaxonomy` returns `subcategories: {id,name,categoryId,categoryName}[]`, tree view becomes department → category → subcategory → product; product form swaps the two comboboxes for one subcategory combobox (`emptyLabel: "Sem subcategoria"`, option name `${sub.name} · ${sub.categoryName}`); `product-taxonomy.ts` loads `listSubcategories` | files: `catalog/products/{product-filter.ts,products-table.tsx,product-form.tsx,product-taxonomy.ts,new/page.tsx,[productId]/page.tsx}`, `apps/web/tests/product-filter.test.ts` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products" apps/web/tests/product-filter.test.ts && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products" apps/web/tests/product-filter.test.ts && bun test apps/web/tests/product-filter.test.ts` | P6
- [ ] S16 Departments screen: drop `"use cache: private"`/`cacheTag`/`cacheLife` (nothing revalidates them), add `department-search-params.ts`, rebuild the table on the products pattern — `InputGroup` search, status `ToggleGroup`, `Select` sort + `ToggleGroup` direction (headers must NOT look sortable), `Switch` in row (opens S14 move dialog when products exist), row click opens the edit dialog (`DataTable` gains optional `onRowClick` beside `rowHref`), `Alert role="status"` for switch errors, columns Nome / Status / Itens / Última edição / Ações (Excluir) | files: `catalog/departments/{page.tsx,departments-table.tsx,department-search-params.ts}`, `apps/web/src/components/ui/data-table.tsx` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/departments" apps/web/src/components/ui/data-table.tsx && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/departments" apps/web/src/components/ui/data-table.tsx` | P6
- [ ] S17 Categories screen: same recipe, plus a `department` `Select` filter and a Departamentos column (badges from `departmentNames`), create/edit dialog carries the department multi-select, delete guard copy | files: `catalog/categories/{page.tsx,categories-table.tsx,category-search-params.ts}` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/categories" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/categories"` | P6
- [ ] S18 Subcategories screen (new route): list/create/edit/delete, `category` `Select` filter, columns Nome / Categoria / Status / Itens / Última edição / Ações (Excluir) | files: `catalog/subcategories/{page.tsx,subcategories-table.tsx,subcategory-search-params.ts}` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/subcategories" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/subcategories"` | P6
- [ ] S19 Shell: breadcrumb labels for `departments|categories|subcategories|tags|kits`, sidebar `Subcategorias` entry after Categorias, new `catalog/error.tsx` (pt-BR title `Não foi possível carregar o catálogo`, `reset()` button, `role="alert"`), delete the dead `catalog/catalog-tabs.tsx` after re-confirming zero imports | files: `_components/store-breadcrumb.tsx`, `_components/app-sidebar.tsx:215-220`, `catalog/error.tsx` (new), `catalog/catalog-tabs.tsx` (delete) | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/store-breadcrumb.tsx" "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/app-sidebar.tsx" "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/error.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/store-breadcrumb.tsx" "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/app-sidebar.tsx" "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/error.tsx" && grep -r "catalog-tabs" "apps/web/src"` | P6
- [ ] S20 Storefront: render department → category → subcategory sections, skipping empty ones; update `menuProducts` to walk `departments[].categories[].subcategories[].products` | files: `apps/web/src/app/(storefront)/menu/page.tsx`, `apps/web/src/app/(storefront)/_lib/storefront-data.ts:46-49` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(storefront)/menu" "apps/web/src/app/(storefront)/_lib/storefront-data.ts" && bunx oxlint "apps/web/src/app/(storefront)/menu" "apps/web/src/app/(storefront)/_lib/storefront-data.ts"` | P6

### Phase 5 — artifacts and definition of done

- [ ] S21 Regenerate the OpenAPI documents and Next typegen | files: `apps/orpc-server/openapi/tenant.json`, `apps/orpc-server/openapi/commerce.json` | owner: implementer | verify: `bun run --filter '@menuza/orpc-server' openapi:generate && bun run typegen` | P7
- [ ] S22 Full check chain, reported per command | owner: verifier | verify: `bun run design:check && bun run typecheck && bun test && bun run lint && bun run fmt:check && bun run build` | P7

## Parallel

- P0: S1 → S2 → S3 (single chain; contract before plan, plan before seed).
- P1: S4, S5.
- P2: S6 (must land before P3; every P3 step imports `taxonomy.ts`/`catalog.ts`).
- P3: S7, S8, S9, S10 — disjoint files. Each verify formats only its own files; never run `oxfmt` on the whole `panel/` directory while a sibling step is in flight.
- P4: S11, then S12 gate.
- P5: S13, S14.
- P6: S15, S16, S17, S18, S19, S20 — disjoint files (`data-table.tsx` belongs to S16 only).
- P7: S21 → S22.

## Risks / Not doing

- `bun run typecheck` is red from S4 until S12; do not treat intermediate red as a regression.
- `DataTable` changes are additive (`onRowClick`); `rowHref` and every existing caller stay as-is.
- Departments page needs a second read (`listCategories`) to populate the move dialog; no new procedure.
- Removing `"use cache: private"` from departments/categories costs one API read per visit — the current cache already serves stale rows after a mutation.
- `Product.departmentId` disappears; anything filtering by it must go through `departmentIds` (S15).
- No new dependency, no new package, no new abstraction layer.

## Accepted limitations

1. Existing rows report the migration time as `updatedAt` (the column default is `now()` at `ALTER TABLE`); there is no earlier timestamp to derive from.
2. A product that had `departmentId` but no `categoryId` becomes unassigned (`subcategoryId = null`); its department grouping is lost. This is the documented cost of making the subcategory the only grouping.
3. `CategoryDepartment` links are **inferred** from products that carried both ids; a category that was never paired with a department starts unlinked.
4. Inactive filtering on the storefront is level-local: an inactive category hides its subcategories and products even when the subcategory is active.
5. Departments have no manual order (`sortOrder` was dropped); the only ordering is `name`/`itemsCount`/`updatedAt`.
6. Subcategories have no SEO entries and no public route; the sitemap still advertises `/categorias/{id}` and `/departamentos/{id}` for routes that do not exist (pre-existing mismatch, unchanged).
7. The products list keeps client-side filtering; only the three taxonomy lists sort in SQL.

## Migration rollback

- The package is forward-only once applied. Roll back by restoring the pre-deploy dump (`pg_dump` before `bun run db:deploy`) and reverting `contract.prisma` + `refs/db.json` to the previous commit, then `bun run db:generate`.
- If only the data step must be undone without a dump: `Product.subcategoryId` still carries the old category mapping 1:1 through `Subcategory.categoryId`, so `UPDATE "Product" p SET "categoryId" = s."categoryId" FROM "Subcategory" s WHERE s."id" = p."subcategoryId"` reconstructs it after re-adding the column in a **new** migration. Never edit the applied package.
- `bun run db:deploy` must not pass `--advance-ref`; only the local `db:migrate` run advances `refs/db.json`.
