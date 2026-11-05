# features/catalog

Products, kits, taxonomy (departments, categories, subcategories, tags, badges),
and the product editor.

## Layout

- `server/catalog.functions.ts` (+ per-entity files) — all panel reads/writes.
- `components/` — `product-form`, `seo/` (the SEO tab, reusable per entity),
  taxonomy tables, image picker, money inputs.
- `schemas/` — valibot schemas for create/update payloads.
- `lib/` — search-param parsing and flattening helpers.

## Invariants

- `staleTime: 30_000` is allowed **only** for the product editor and the
  product-create taxonomy options; list reads stay uncached.
- Search params parse in the route loader from `loaderDeps` via
  `load*SearchParams`; never parse inside `validateSearch`.
- The CSV export is a server route: `src/routes/dashboard/$storeSlug/catalog/products/export.ts`,
  the one route file allowed to import `@/server/**`.
- Money is integer cents end to end; format with `formatBrl`.
- SEO previews go through `applySeoTokens` from `@menuza/shared/seo`; never
  hand-roll token replacement.
- Forms use `@tanstack/react-form` with `const schema: any = …Schema;` plus a
  reason comment, and `@/lib/form-errors.ts` to render valibot issues.

## Forbidden

Next.js imports, direct calls to the Rust APIs (`@/lib/api/**`).

## Verify

`bunx oxfmt apps/web/src/features/catalog && bunx oxlint apps/web/src/features/catalog && bun run --filter '@menuza/web' build`

## Kits

The kit editor is not a dialog: `catalog/kits/new.tsx` and `$kitId.tsx` mount
`KitForm` with three tabs (identidade, composição & regras, preço), and the tab
follows the first invalid field on submit. Rules that change composition live at
the top of the composition tab, never in a tab of their own. `KitItemsEditor`
owns one card per group plus a `Pratos sem grupo` section; `kit-preview.tsx`
renders what the buyer sees.

`schemas/kit.ts` mirrors the Rust `validate()` rule for rule — when one side
changes, change both. `lib/kit-price.ts` is the only place that resolves a kit
price and `apps/web/tests/kit-price.test.ts` pins its three steps (floor, kit
percent, progressive band). Never format or compute a kit price inline.

The dish picker reads `panel.listKitOptions` (`GET /panel/stores/{storeSlug}/kit-options`),
not the product list: a kit item names a product **and** a variation, and only
that endpoint carries both with prices, plus the product image and category used
by `product-combobox.tsx`.
