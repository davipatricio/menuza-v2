# features/coupons

Coupon list, create form, detail tabs, and the redemption table.

## Layout

- `server/coupons.functions.ts` — panel reads/writes.
- `components/` — `coupons-table.tsx` (list island), `coupon-form.tsx`,
  `coupon-product-picker.tsx`, `redemptions-table.tsx`, detail tabs.
- `schemas/` — the coupon payload schema shared by form and server function.

## Invariants

- The list is the shared `DataTable`; search, sorting and bulk delete stay
  local over the rows the loader already returned; it never fetches on mount.
- Every write is an oRPC call followed by `void router.invalidate()`.
- Redemption pagination and debounce live in `redemptions-table.tsx`; order
  codes link to `/dashboard/$storeSlug/orders/$orderCode`.
- Empty and error states are first-party (`Empty`, `Alert variant="destructive"`),
  never a bare `<p>` when the previous screen had a card.

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`.

## Verify

`bunx oxfmt apps/web/src/features/coupons && bunx oxlint apps/web/src/features/coupons && bun run --filter '@menuza/web' build`
