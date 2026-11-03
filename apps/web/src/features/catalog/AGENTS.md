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
