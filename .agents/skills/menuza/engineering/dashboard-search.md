# Dashboard search

One palette in the store dashboard, opened from the header button or `Ctrl/Cmd+K`.
It searches the store's own pages and entities and offers a few safe quick actions.
It is not an external search engine.

## Shape

- Mounted once in `layout.tsx`, right after `<HeaderActions />`, so every
  `/dashboard/[storeSlug]/*` route has it.
- Searches **pages and entities** of the current store only. `Pedidos` is a page.
- Result groups, in render order: `page`, `product`, `coupon`, `customer`, `tag`,
  `category`, `department`, `badge`, `subcategory`.
- Quick actions live on the active row only: a coupon switch, a product availability
  switch, and copy. Everything else navigates.

## Data flow

1. The browser island calls `panel.search` over same-origin `/tenant/rpc`
   (`RPCLink`), one request per settled keystroke.
2. The API returns **entities only**. The palette merges the 19 nav pages
   client-side from `nav-config.ts`, because `packages/api-tenant` must not import
   `apps/web` — the nav list has exactly one owner.
3. 250 ms debounce; a stale-response counter (`requestId`) drops an answer that a
   newer keystroke has superseded. Previous results stay on screen while the next
   query loads; a failure is tagged with its query so a new keystroke does not
   inherit the message.
4. Queries shorter than 2 characters show pages only and issue no request.

## Contract

`GET /panel/stores/{storeSlug}/search`, `operationId: "searchPanel"`.

| Part   | Shape                                                                                    |
| ------ | ---------------------------------------------------------------------------------------- |
| input  | `{ storeSlug, q }` — `q` trimmed, 2–80 characters                                        |
| output | `{ canWrite, groups: [{ kind, items }] }`                                                |
| kinds  | `product`, `coupon`, `customer`, `tag`, `category`, `department`, `badge`, `subcategory` |
| item   | `{ kind, id, label, sublabel?, status?, href }`                                          |

- Max 5 items per group, 30 in total.
- No `total` field: a group that reaches 5 rows is the one the palette can send to
  "Ver todos", which saves a count per keystroke. The palette renders that link for
  `product`, `coupon`, `department`, `category` and `subcategory` when a group has 5
  items and `q` is set; `items.length === 5` is the whole signal.
- `canWrite = can(store.role, "catalog:write")` is **UI-only** — it disables the
  switches and the menu items; the write procedures re-check the capability.

## Search semantics

- Case-insensitive `ILIKE '%q%'` through an escaped `likePattern` (backslash, `%`
  and `_` are escaped, so a literal `%` matches a literal `%`).
- Per kind: a SQL window of 20 rows, then ranking in `search-rank.ts`
  (prefix matches first, then `localeCompare(…, "pt-BR")`, then `id`), then slice
  to 5. The total cap of 30 is applied group by group in fixed order; an empty
  group is dropped, not emitted.
- No accent folding: `ILIKE` does not fold accents either, so the ranking would
  disagree with the filter if it did. The client-side page matching _does_ strip
  accents (`normalize` in `nav-config.ts`) — the two halves differ on purpose.
- No Postgres extension and no index in v1 (`pg_trgm` is a follow-up), no
  full-text engine, no semantic search.

## Files

- Contract: `packages/shared/src/panel/contracts.ts` (`PanelSearchInputSchema`,
  `PanelSearchOutputSchema`, `search`).
- Implementation: `packages/api-tenant/src/domains/tenant/subdomains/panel/search.impl.ts`
  and `search-rank.ts` (+ `search-rank.test.ts`).
- Integration test: `packages/api-tenant/test/panel-search.test.ts`.
- Web, all in `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/`:
  `global-search.tsx` (trigger + `Ctrl/Cmd+K`), `global-search-dialog.tsx`
  (listbox, keyboard, empty/error states), `global-search-row.tsx` (row, switches,
  menu), `global-search-actions.ts` (client + write calls + clipboard),
  `use-global-search.ts` (debounce, request counter, page merge),
  `global-search-utils.ts` (group labels, order, flatten, cursor math),
  `nav-config.ts` (nav tree, keywords, page matching). Unit test:
  `apps/web/tests/global-search-utils.test.ts`.

## Quick actions

- They render in a single strip for the active row, outside the listbox, so the
  options stay reachable without nesting widgets inside an `option`.
- **Coupon switch** reuses `POST /panel/stores/{storeSlug}/coupons/{couponId}/status`
  (`setCouponStatus`). Activating an expired coupon is refused server-side, so the
  switch is disabled when the row status is `expired`.
- **Product switch** reuses the partial `updateProduct` with only `available`.
- **Taxonomy and customer rows** navigate; copy is the only other action.
- Optimistic with rollback: the row keeps an override tagged with the value it
  replaced, so a server status wins once it changes. Feedback is inline
  (`role="status"`), plus `router.refresh()` on success. No toast.
- Writes re-check `requireCapability`; `canWrite = false` only disables the UI, it is
  not the gate.

## Tenancy and security

- `resolveStore` + `inTenantScope` on every call; each of the eight queries carries
  an explicit tenant filter. Unknown slug and non-member are both `NOT_FOUND`.
- The customer payload is limited to the visible columns (`id`, `name`, `email`).
- The client `storeSlug` is never trusted — it is the lookup key, not the scope.

## Non-goals

No external search engine. No cross-store search. No recents. No orders as entity
results. No semantic/NLU search. No accent folding. No taxonomy writes from the
palette.

## Verification

- `bun run design:check` (dashboard UI), `bun test packages/api-tenant`,
  `bun test apps/web`.
- `bun run test:integration` runs the whole set; `panel-search.test.ts` skips
  without `TEST_INTEGRATION`. One pre-existing team-fixture failure is known.
- `bunx oxfmt --check` on the paths the change touched.
- Finish with `design:check && typecheck && test && lint && fmt:check && build`
  (`checks.md`).

## Gotchas

- Prisma 8's ORM uses `.limit()`, not `.take()`.
- Coupon reads exclude soft-deleted rows with `and(…eq(null))` on `deletedAt`.
- `?q=` deep links exist for products, coupons, departments, categories and
  subcategories. Tags and badges land on the unfiltered list; customers open by id.
- No `command.tsx`, no `cmdk`, no Radix: the palette is a hand-built Base UI `Dialog`
  plus a `role="listbox"` list with `aria-activedescendant`.
