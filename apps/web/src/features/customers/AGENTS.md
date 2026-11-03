# features/customers

Customer list and detail (contact card, order history).

## Layout

- `server/customers.functions.ts` — `listCustomersFn`, `loadCustomerFn`.
- `components/customers-table.tsx` — `DataTable` + `dashboardTableFeatures`
  with `ColumnDef` columns; search, sorting and CSV via `exportToCsv`.

## Invariants

- Loaders return `null` when there is no panel session; the route maps that to
  `redirect({ href: "/dashboard/login" })`.
- An unknown customer id is `notFound()` at the route, not an empty page.
- Order rows link with a typed `Link` to `/dashboard/$storeSlug/orders/$orderCode`.
- Phone/date formatting comes from `@/lib/format.ts`.

## Forbidden

Next.js imports, direct calls to the Rust APIs (`@/lib/api/**`).

## Verify

`bunx oxfmt apps/web/src/features/customers && bunx oxlint apps/web/src/features/customers && bun run --filter '@menuza/web' build`
