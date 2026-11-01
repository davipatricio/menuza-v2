# Rework the coupons list: catalog-style select/switch columns, bulk-only delete, soft delete when linked

Status: active
Updated: complete

## Non-goals

- No restore/undelete flow, no `deletedAt` on any model other than `Coupon`.
- No changes to `coupon-form.tsx`, coupon detail, product scope, pricing, `couponWindow`, `resolveCouponStatus`.
- No partial unique index on `code`; no `AuditLog` writes; no `updateCoupon` refactor.
- CSV export keeps its current nine columns (a superset of the visible table); no search/filter/URL-parser changes. `?sort=endDate` stays accepted by `coupon-search-params.ts:14` even though no header exposes it.
- No docs or Linear updates unless an existing claim becomes false.

## Assumptions

- verified: `Coupon` has no name field; the requested `Name` column maps to the existing `code` column (`coupons-table.tsx:156-174`).
- verified: `Concedido` is the existing `discountCents` column (total granted), `coupons-table.tsx:186-193`; the dropped `Desconto` column is `discountType`/`valueCents`/`valuePercent` (`175-179`).
- verified: `PanelCouponSummarySchema` carries `redemptionCount`, `discountCents`, `uniqueCustomers`, `lastRedeemedAt`, `effectiveStatus`, `endsAt` (`packages/shared/src/panel/contracts.ts:1065-1093`).
- verified: `Order.couponId` is nullable `SetNull`, `CouponRedemption.couponId` is `Cascade`, `CouponProduct.couponId` is `Cascade`; no `Restrict` (`packages/db/prisma/contract.prisma:651-697`, `760-779`, `1067-1080`).
- verified: `resolveCouponStatus` expects a z-less window string (`coupon-status.ts:23-39`); `toPanelTimestamp` appends `Z` (`format.ts:31-32`) and must NOT be fed to it.
- verified: no `setCouponStatus`, `bulkDeleteCoupons`, or any bulk coupon procedure exists; `bulkDeleteProducts` is the precedent (`contracts.ts:1621-1632`, `bulkDeleteProducts.impl.ts`).
- verified: `prisma contract emit` writes only `packages/db/prisma/generated/client/**` (gitignored); it never writes `packages/shared`, so S1 and S2 are disjoint (`packages/db/AGENTS.md`).
- verified: `apps/orpc-server/openapi/tenant.json` is pretty-printed, keyed by absolute path, each operation carries `operationId` plus an inline 200 response schema (`tenant.json:14232-14292` for DELETE).
- verified: newest migration package is `packages/db/migrations/app/20261030T2356_coupon_product_scope`; `refs/db.json` must be read, not assumed current.
- verified: `panelReads.test.ts` mock `byTenant` (323-325) only filters `tenantId`; the Coupon fake at 493 ignores `id`/`code`/`status` and does not accept predicates.
- unverified: cap of 100 ids per bulk request is the right bound (cheap to change).
- unverified: soft-deleted coupons keep their code reserved, so re-creating the same code fails on `@@unique([tenantId, code])`.

## Behaviour contract

1. Columns, in order and only these: `select | switch | code | redemptionCount | discountCents | uniqueCustomers | lastRedeemedAt`. No per-row delete button, no `effectiveStatus` badge column.
2. Switch is status-only: new procedure writes `status` (`active`/`disabled`); checked when `effectiveStatus === "active"`; disabled when `expired`. Server recomputes `resolveCouponStatus`; activating a coupon whose `endsAt` already passed is rejected (`VALIDATION_FAILED`), never silently stored as `active`.
3. Delete rule, shared by single and bulk: linked = at least one `CouponRedemption` row OR at least one `Order` with that `couponId`. Linked rows get `deletedAt = now` plus `status = "disabled"`; unlinked rows are hard-deleted. Outputs differ by design: single `deleteCoupon` keeps the existing `{ success, archived }` contract unchanged; bulk `bulkDeleteCoupons` returns `{ deleted, archived }` counts.
4. Panel reads hide `deletedAt != null` (`listCoupons`, `listCouponSummaries`, `getCouponDetail`, `updateCoupon` existence). Duplicate-code checks in `createCoupon`/`updateCoupon` stay UNFILTERED so the error is an explicit `VALIDATION_FAILED`, not a unique violation from a hidden row.
5. Bulk delete is one transactional server procedure over the selected ids, tenant-scoped, `NOT_FOUND` when any id is not owned/visible (same contract as `bulkUpdateProducts`). Delete UI exists only in the selection bulk bar.
6. Sorting: surviving header keys are `code`, `redemptionCount` (param `redemptions`), `discountCents` (param `discount`), `lastRedeemedAt` (param `lastRedeemed`). `endsAt: "endDate"` is removed from `serverSort.columns` with the `endsAt` column. `uniqueCustomers` is non-sortable: no `serverSort` entry and no click handler, keeping the existing `id: "uniqueCustomers"` column with no sort metadata. `compareCoupons` keeps its `endDate` case so an existing `?sort=endDate` URL still orders rows; no header reaches it.
7. CSV export is unchanged, nine columns: `code/CÃ³digo`, `description/DescriÃ§Ã£o`, `discountType/Tipo`, `discount/Desconto` (`formatDiscount`), `redemptions/Resgates`, `discountCents/Desconto concedido`, `uniqueCustomers/Clientes Ãºnicos`, `lastRedeemedAt/Ãšltimo uso`, `status/Status`.
8. Selection lives in `CouponsTable` (outside `DataTable`, which remounts on `key={JSON.stringify([q, status, sort, order])}`, `coupons-table.tsx:364`). It is pruned against current props on every render (`activeSelectedIds = selectedIds.filter(id => coupons.some(c => c.id === id))`, products `378-380`), survives a filter change in state but rows hidden by the filter leave the action set, and is cleared after a successful bulk action. Dialog copy is generic and honest: rows with redemptions or orders are deactivated, the rest are removed permanently.

## Code map

- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupons-table.tsx` â€” `CouponsTable` 77-90, `deleteMutation` 108-126, `serverSort` 134-153 (keys 138-142), `columns` 155-245 (code 156-174, discount 175-179, redemptions 180-185, conceded 186-193, customers 194-201, last use 202-214, status 215-224, actions 225-244), `exportColumns` 247-285, search 290-312, filter 314-334, `DataTable` 363-373 (`key` 364), `AlertDialog` 375-409.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupon-filter.ts` â€” `compareCoupons` 51-83 (`endDate` 73-78).
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupon-search-params.ts` â€” `LIST_SORTS` 14.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/products-table.tsx` â€” reference: selection 364-387 (`activeSelectedIds` 378-380), `availabilityMutation` 389-408, `bulkDeleteMutation` 427-448, `availabilitySwitch` 460-480, select column 646-664, switch column 665-670, bulk bar 1070-1130.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/tags/tags-table.tsx` â€” select 152-171, switch 172-177, `activeSwitch` 118-134 (no bulk bar).
- `apps/web/src/components/ui/data-table.tsx` â€” `dashboardTableFeatures` 52-62, `DataTableProps` 82-121, `DataTable` 331; no row-selection feature.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/page.tsx` â€” `panel.listCouponSummaries` 69, props 145-150; unchanged.
- `packages/shared/src/panel/contracts.ts` â€” `PanelCouponSummarySchema` 1065-1093, `DeleteCouponInputSchema` 2104-2107, `couponDeletedOutput` 2115, `deleteCoupon` 2143-2154, `panelContractObject` 2651+ (coupons 2691-2695), `BulkDeleteProducts*` 746-755 (shape precedent).
- `packages/api-tenant/src/domains/tenant/subdomains/panel/deleteCoupon.impl.ts` â€” 12-51, rewrite body.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/listCoupons.impl.ts` â€” query 19-24.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/listCouponSummaries.impl.ts` â€” query 17-22.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/getCouponDetail.impl.ts` â€” 34-40.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/updateCoupon.impl.ts` â€” 46-58.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/createCoupon.impl.ts` â€” dup check 57-61 (leave unfiltered).
- `packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts` â€” imports 39-46, registration 101-106.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/coupon-status.ts` â€” `resolveCouponStatus` 23-39; `coupon-window.ts` â€” `couponWindow` 54-66.
- `packages/api-tenant/src/domains/tenant/subdomains/panel/bulkDeleteProducts.impl.ts` â€” transaction/scope pattern.
- `packages/db/prisma/contract.prisma` â€” `model Coupon` 994-1061 (uniques/indexes 1021-1022), `Order` 651-697 (`couponId` 667), `CouponRedemption` 760-779.
- `packages/db/package.json` â€” `db:generate` 16, `db:migrate` 17, `db:deploy` 14; packages at `migrations/app/<ts>_<name>/{migration.ts,ops.json}`, ref at `migrations/app/refs/db.json`.
- `packages/api-commerce/src/domains/commerce/subdomains/orders/money.ts` â€” `applyCoupons` lookup ~50 (`{tenantId, id}` + `forUpdate`, no status filter).
- `packages/api-commerce/src/domains/commerce/subdomains/orders/create.impl.ts` â€” 87 already filters `status: "active"`; leave.
- `packages/api-tenant/test/panelReads.test.ts` â€” `rows` 293-301, `TenantFilter` 308-312, `byTenant` 323-325, Coupon fake 493.
- `apps/orpc-server/test/openapi.test.ts` â€” route table 281-315, route agreement 447-459, document pin 469-477.
- `apps/orpc-server/openapi/tenant.json` â€” committed document; DELETE operation shape at 14232-14292.

## Steps

- [x] S1 Add `setCouponStatus` (`POST /panel/stores/{storeSlug}/coupons/{couponId}/status`, operationId `setPanelCouponStatus`, output `PanelSuccessOutputSchema`) and `bulkDeleteCoupons` (`POST /panel/stores/{storeSlug}/coupons/bulk-delete`, operationId `bulkDeletePanelCoupons`, output `{ deleted, archived }`), each with `.meta(openapi({ method, path, operationId, summary, tags: ["panel"] }))`, and register both in `panelContractObject`; `couponDeletedOutput` is untouched | files: packages/shared/src/panel/contracts.ts, apps/orpc-server/openapi/tenant.json (regenerated by verify) | owner: implementer | verify: `cd apps/orpc-server; bun run openapi:generate && bun -e 'const d = await Bun.file("openapi/tenant.json").json(); const want = { setPanelCouponStatus: ["/panel/stores/{storeSlug}/coupons/{couponId}/status", ["success"]], bulkDeletePanelCoupons: ["/panel/stores/{storeSlug}/coupons/bulk-delete", ["deleted", "archived"]] }; for (const [id, [path, fields]] of Object.entries(want)) { const op = d.paths[path]?.post; if (!op || op.operationId !== id) throw new Error("missing " + id); const props = op.responses["200"].content["application/json"].schema.properties; for (const field of fields) if (!(field in props)) throw new Error(id + " output " + field); } console.log("openapi ok");'` | P1
- [x] S2 Add `Coupon.deletedAt Timestamp(3)?` and `@@index([tenantId, deletedAt])`, then emit the contract (writes only `packages/db/prisma/generated/client/**`) | files: packages/db/prisma/contract.prisma | owner: implementer | verify: `bun run db:generate` | P1
- [x] S3 Read `migrations/app/refs/db.json` and `bunx prisma migration status` first; if `20261030T2356_coupon_product_scope` is unapplied or the ref lags `currentContract`, run `bun run db:deploy` then `bunx prisma db migrate --advance-ref db`. Then plan `--name coupon_soft_delete`, review `ops.json`, apply with `prisma db migrate --advance-ref db` | files: packages/db/migrations/app/<new>/migration.ts, packages/db/migrations/app/<new>/ops.json, packages/db/migrations/snapshots/<new>/, packages/db/migrations/app/refs/db.json | owner: implementer | verify: `cd packages/db; bunx prisma migration status && test -n "$(git diff --name-only migrations/app/refs/db.json)" && bun -e 'const fs = require("node:fs"); const dirs = fs.readdirSync("migrations/app").filter((d) => d.endsWith("_coupon_soft_delete")); if (dirs.length !== 1) throw new Error("packages " + dirs); const ops = JSON.parse(fs.readFileSync("migrations/app/" + dirs[0] + "/ops.json", "utf8")); const details = (o) => o.target?.details ?? {}; const col = ops.some((o) => details(o).objectType === "column" && details(o).table === "Coupon" && details(o).name === "deletedAt"); const idx = ops.some((o) => details(o).objectType === "index" && details(o).table === "Coupon" && o.execute?.some((e) => /"deletedAt"/.test(e.sql))); const stray = ops.filter((o) => /drop /i.test(o.label)); if (!col || !idx || stray.length) throw new Error(JSON.stringify({ col, idx, stray: stray.map((o) => o.label) })); console.log("ops ok");'` | P2
- [x] S4 Add both new routes to the OpenAPI route table and confirm the committed document still matches (regenerate is idempotent after S1) | files: apps/orpc-server/test/openapi.test.ts | owner: implementer | verify: `cd apps/orpc-server; bun test test/openapi.test.ts` (this test compares the committed document to a fresh generation byte-for-byte; a stale `tenant.json` fails here) | P2
- [x] S5 Write `coupon-delete.ts` (count redemptions + orders, soft-archive or hard-delete in one transaction) and rewrite `deleteCouponImpl` to use it, keeping its `{ success, archived }` output | files: packages/api-tenant/src/domains/tenant/subdomains/panel/coupon-delete.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/deleteCoupon.impl.ts | owner: implementer | verify: `bun test packages/api-tenant` | P3
- [x] S6 Filter `deletedAt.eq(null)` in the four panel reads using the predicate form `where((c) => and(c.tenantId.eq(...), c.deletedAt.eq(null)))` | files: packages/api-tenant/src/domains/tenant/subdomains/panel/listCoupons.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/listCouponSummaries.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/getCouponDetail.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/updateCoupon.impl.ts | owner: implementer | verify: `bun test packages/api-tenant` | P3
- [x] S7 Ignore soft-deleted coupons in the by-id pricing lookup | files: packages/api-commerce/src/domains/commerce/subdomains/orders/money.ts | owner: implementer | verify: `bun test packages/api-commerce` | P3
- [x] S8 Write `setCouponStatusImpl` (capability, `resolveCouponStatus` with the z-less `endsAt`, reject expired) and `bulkDeleteCouponsImpl` (transaction over ids, uses the S5 helper, returns `{ deleted, archived }`), register both | files: packages/api-tenant/src/domains/tenant/subdomains/panel/setCouponStatus.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/bulkDeleteCoupons.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts | owner: implementer | verify: `bun test packages/api-tenant` | P4
- [x] S9 Rework the table: 7 ordered columns, select + switch, optimistic status overrides with rollback, `activeSelectedIds` pruning, bulk bar as the only delete entry point, honest dialog copy, `endsAt` mapping removed, `uniqueCustomers` non-sortable, CSV unchanged | files: apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupons-table.tsx | owner: implementer | verify: `bun -e 'const s = await Bun.file("apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupons-table.tsx").text(); const marks = ["id: \"select\"", "id: \"switch\"", "accessorKey: \"code\"", "id: \"redemptionCount\"", "id: \"discountCents\"", "id: \"uniqueCustomers\"", "id: \"lastRedeemedAt\""]; const at = marks.map((m) => s.indexOf(m)); if (at.some((i) => i < 0) || at.some((i, n) => n > 0 && i <= at[n - 1])) throw new Error("columns " + JSON.stringify(at)); if (/id: "actions"/.test(s)) throw new Error("row actions column remains"); if (!/bulkDeleteCoupons/.test(s) || !/activeSelectedIds/.test(s)) throw new Error("bulk bar missing"); if (/setConfirming/.test(s)) throw new Error("row delete dialog remains"); if (/endsAt: "endDate"/.test(s)) throw new Error("endsAt sort mapping remains"); console.log("table ok");' && bun run design:check && cd apps/web && bun check` | P4
- [x] S10 Widen the Coupon fake to honour `id`/`code`/`status` and predicate filters, then add infra-free tests: soft-delete branch (redemption present), hard-delete branch (nothing linked), order-reference-only branch, bulk `{ deleted, archived }` counts, status resolution (active, disabled, expired rejected, z-less date handling), cross-tenant id `NOT_FOUND`, `staff` `FORBIDDEN` | files: packages/api-tenant/test/panelReads.test.ts, packages/api-tenant/test/couponWrites.test.ts | owner: implementer | verify: `bun test packages/api-tenant` | P5
- [x] S11 Review contracts, schema and migration, both impls, the four filtered reads, commerce lookup, table rework, and the new tests against the behaviour contract | files: packages/shared/src/panel/contracts.ts, apps/orpc-server/openapi/tenant.json, packages/db/prisma/contract.prisma, packages/db/migrations/app/<new>/migration.ts, packages/db/migrations/app/<new>/ops.json, packages/api-tenant/src/domains/tenant/subdomains/panel/coupon-delete.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/deleteCoupon.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/setCouponStatus.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/bulkDeleteCoupons.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/listCoupons.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/listCouponSummaries.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/getCouponDetail.impl.ts, packages/api-tenant/src/domains/tenant/subdomains/panel/updateCoupon.impl.ts, packages/api-commerce/src/domains/commerce/subdomains/orders/money.ts, apps/web/src/app/(dashboard)/dashboard/[storeSlug]/coupons/coupons-table.tsx, apps/orpc-server/test/openapi.test.ts, packages/api-tenant/test/panelReads.test.ts, packages/api-tenant/test/couponWrites.test.ts | owner: reviewer | verify: none (review) | P6
- [x] S12 Run the definition-of-done chain and report each result | owner: verifier | verify: `bun run design:check && bun run typecheck && bun test && bun run lint && bun run fmt:check && bun run build` | P7

## Parallel

- P1: S1, S2
- P2: S3, S4
- P3: S5, S6, S7
- P4: S8, S9
- P5: S10
- P6: S11
- P7: S12

## Risks / Not doing

- Double submit: two bulk/switch mutations in flight can archive+delete the same row. Disable the dialog action and switches while `isPending`; the server rule is idempotent (an already-deleted id returns `NOT_FOUND`).
- Stale selection: `activeSelectedIds` is derived from current props, never raw ids, so a refresh or filter drops vanished rows from the action set.
- Optimistic rollback: clear the override for the touched id on error, not only on success, or the switch lies after a rejected transition.
- Tenant scope in bulk: `in` and null checks require the predicate form; `updateAll`/`deleteAll` must keep the full filter or the isolation guard rejects the write. Never `update`/`delete` by id.
- Capability: `catalog:write` only; `staff` gets `FORBIDDEN`, surfaced in the page Alert. No capability probe in the UI, matching the current page.
- Date round-trip: the switch must not send `startsAt`/`endsAt`; passing `toPanelTimestamp` output into `resolveCouponStatus` throws because of the trailing `Z`.
- Reserved code: a soft-deleted coupon's code cannot be reused; the duplicate error must stay explicit.
- Hard delete is still possible for a coupon with `CouponProduct` rows (no order/redemption link); the cascade removes scope rows, which is the intended cleanup.
- OpenAPI drift: `tenant.json` is pinned byte-for-byte by `apps/orpc-server/test/openapi.test.ts:469-477`; S1 regenerates it and S4 fails if a rerun produces a diff.
