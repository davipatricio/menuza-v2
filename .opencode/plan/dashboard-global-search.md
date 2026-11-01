# Dashboard global search palette (Cmd/Ctrl+K)

Status: in progress
Updated: 2026-10-31
Owner legend: `implementer` (code), `reviewer` (gate), `verifier` (checks). Step state: `[ ]` planned, `[~]` in progress, `[x]` verified, `[!]` blocked.

## Goal

One command palette reachable from the dashboard header or `Ctrl/Cmd+K` that searches pages, subpages and entities (products, coupons, customers, tags, categories, departments, badges) inside the current store, and offers quick management (coupon activate/deactivate, product availability, row actions) without leaving the palette.

## Non-goals

- No Elasticsearch / Meilisearch / Typesense / external search engine. Postgres `ILIKE` per tenant only.
- No cross-store or global (multi-tenant) search. Scope is the `storeSlug` in the current route.
- No semantic / NLU / fuzzy-prefix engine. Deterministic substring + prefix-first ranking.
- No accent-insensitive matching in v1 (follow-up: `unaccent` or a generated normalized column).
- No orders in v1 results (`/dashboard/[storeSlug]/orders` page itself stays searchable as a page).
- No recents / pinned / history persistence in v1 (empty state = quick nav).
- No catalog taxonomy switches (full-payload updates — see Decisions).
- No new dependency, no `cmdk`, no Radix, no `sonner`.

## Assumptions

- verified: `apps/web` never touches the DB; server islands call `panelClient()` (`src/lib/server-tenant.ts`) → loopback `/rpc` with `menuza_tenant_sid`.
- verified: browser islands already call same-origin `/tenant/rpc` via `createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }))` (`catalog/tags/tags-table.tsx:33`, `catalog/departments/departments-table.tsx:51`, `catalog/_components/taxonomy-dialog.tsx:75`) — reuse for palette mutations, then `router.refresh()`.
- verified: header mount point is `(dashboard)/dashboard/[storeSlug]/layout.tsx` lines 84–104, `<HeaderActions />` at ~line 104; `export const instant = false` in that file.
- verified: nav source is a local `groups` array (`_components/app-sidebar.tsx:207-239`) plus `SETTINGS_CHILDREN` (`:65-72`) — nothing exported.
- verified: `?q=` deep links exist for products, coupons, departments, categories, subcategories; not for tags, badges, customers.
- verified: `ListDepartmentsInputSchema:850`, `ListCategoriesInputSchema:858`, `ListSubcategoriesInputSchema:867` accept `q` (`name.ilike(likePattern(q))`); products/tags/coupons/customers/badges use `PanelStoreInputSchema` (no `q`). No `ListCouponsInputSchema`, `ListBadgesInputSchema`, customer list schema.
- verified: `panel.updateCoupon` is a full payload (`UpdateCouponInputSchema:2015`) and `PanelCouponSummarySchema` lacks `discountValue`; `panel.updateProduct` is partial (`available?`, `UpdateProductInputSchema:635`).
- verified: coupon `effectiveStatus` — expired wins (`coupons/[couponId]/page.tsx:80-87`).
- verified: primitives present: `dialog`, `combobox` (exports at line 256), `input`, `input-group`, `dropdown-menu`, `switch`, `badge`, `empty`, `spinner`, `alert`, `scroll-area`. No `command.tsx`.
- verified: `components/AGENTS.md:9-16,64-67` bans the shadcn cmdk/Radix registry path; `DESIGN.md:111` says add `command` when first needed.
- verified: `animate-in`/`zoom-in-95` classes are inert (`tw-animate-css` absent).
- unverified: per-group limit 5 and 250 ms debounce are the right feel (measure after step 4).

## Decisions

| #   | Question                                                       | Decision                                                                                                                              | Why                                                                                                                                |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1  | One coalesced server search vs 5–7 list calls from the browser | **Single `panel.search`**                                                                                                             | One roundtrip, minimal payload, no full-list/PII overfetch, consistent server-side ranking and limits                              |
| D2  | Trigger surface                                                | Header button (`HeaderActions`) + `Ctrl/Cmd+K` (and `⌘K` label on mac)                                                                | Discoverable and keyboard-reachable; global keydown listener in the palette component only                                         |
| D3  | Palette primitive                                              | **Hand-build on Base UI `Dialog` + `Combobox`/listbox**, no `cmdk`, no new dep                                                        | `components/AGENTS.md` bans the registry command; `command` cannot be installed without cmdk                                       |
| D4  | Coupon status write                                            | **Reuse the existing narrow `panel.setCouponStatus`** (`storeSlug`, `couponId`, `status`, POST; shipped with the coupons rework)      | Full update needs read-before-write and can stale-overwrite; the narrow write already gates capability and rejects expired coupons |
| D5  | Search semantics                                               | trim, min 2 chars, max 80, case-insensitive `%q%`, per-group limit 5, total cap ~30, prefix-first then alphabetical, tie broken by id | Deterministic and cheap; no ranking service                                                                                        |
| D6  | Empty state                                                    | Quick nav (pages) only; no recents v1                                                                                                 | Recents need storage + privacy decisions; nav covers the common case                                                               |
| D7  | Taxonomy / customer quick actions                              | Navigation only                                                                                                                       | Full-payload updates would risk clobbering concurrent edits                                                                        |
| D8  | Indexes                                                        | None in v1; measure then add `pg_trgm`/GIN as a follow-up                                                                             | Store catalogs are small; premature index work is unpaid complexity                                                                |

## Contract sketch

`packages/shared/src/panel/contracts.ts` (append near the taxonomy list schemas, ~line 850):

```ts
export const PanelSearchKindSchema = v.picklist([
  "product",
  "coupon",
  "customer",
  "tag",
  "category",
  "department",
  "badge",
  "subcategory",
]); // entities only — pages are merged client-side

export const PanelSearchInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(80)),
});

export const PanelSearchItemSchema = v.object({
  kind: PanelSearchKindSchema,
  id: v.string(),
  label: v.string(),
  sublabel: v.optional(v.string()), // coupon code, category name, …
  status: v.optional(v.string()), // active | disabled | expired | available | unavailable
  href: v.string(), // app-relative; resolved per kind (table below)
});

export const PanelSearchOutputSchema = v.object({
  canWrite: v.boolean(), // UI-only: can(store.role, "catalog:write")
  groups: v.array(
    v.object({
      kind: PanelSearchKindSchema,
      items: v.array(PanelSearchItemSchema), // max 5; length === 5 drives "Ver todos"
    }),
  ),
});
```

- `panel.search` returns **entities only**. Pages cannot come from the API: `nav-config.ts` lives in `apps/web` and `packages/api-tenant` must not import from apps (`packages/api-tenant/AGENTS.md`). The palette filters `nav-config.ts` client-side and merges the result under "Páginas".
- `canWrite` is computed server-side from the resolved store role with `can(store.role, "catalog:write")`, so no role→capability matrix is duplicated in the browser. Write procedures still re-check with `requireCapability` — the flag only drives enabled/disabled UI.
- No per-group `total`: `items.length === 5` decides whether "Ver todos" appears (saves 7 count queries per keystroke).
- Every new leaf carries `.meta(openapi({ method: "GET", path: "/panel/stores/{storeSlug}/search", operationId: "searchPanel", summary, tags: ["panel"] }))`.

## API design

- `packages/api-tenant/src/domains/tenant/subdomains/panel/search.impl.ts` — one implementation.
- Guard first: `resolveStore` + `inTenantScope` from `panel/support.ts`; every query carries the store filter. Never trust client `storeSlug` beyond lookup.
- `Promise.all` over the eight entity kinds; each query `take: 5`, no `count`, no N+1, no per-row follow-up queries. No page results here.
- Products: `name.ilike(pattern)` (or `description` if cheap — decide in step 2, do not widen payload).
- Coupons: match `code` only in v1 (label = code, sublabel = description).
- Customers: name + e-mail; return only fields already shown in the customers table.
- Tags/categories/departments/badges: `name.ilike`.
- Ranking: pure helper `rankPanelSearchItems(items, q)` in a sibling `search-rank.ts`; prefix match before substring, then `localeCompare("pt-BR")`, then id. Unit test in `search-rank.test.ts` (precedent `coupon-status.test.ts`).
- Every `ilike` uses the copied `likePattern()` (escapes `\`, `%`, `_`); extraction to `panel/support.ts` is deferred cleanup, not scope.
- `setCouponStatus.impl.ts` — `storeSlug`, `couponId`, `status` (`active` | `disabled`); `requireCapability(store.role, "catalog:write")`; reject when the coupon is expired (`effectiveStatus`), return a mapped `ORPCError` code.
- Router: `packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts` — add `search` and `setCouponStatus` with the OpenAPI meta.

## Web design

Files under `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/`:

| File                       | Purpose                                                                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav-config.ts`            | Extract `groups` + `SETTINGS_CHILDREN` from `app-sidebar.tsx` as exported data (`navGroups(basePath)` factory, `label`, `href`, `icon`, `keywords`) plus `searchNavPages(q, basePath)` (label/keyword substring filter; `q < 2` returns all pages). Sidebar and palette both import it. |
| `global-search.tsx`        | Trigger button + `Ctrl/Cmd+K` listener + dialog mount. Client component.                                                                                                                                                                                                                |
| `global-search-dialog.tsx` | Base UI `Dialog` shell, `Combobox`/listbox, groups, footer hints.                                                                                                                                                                                                                       |
| `global-search-row.tsx`    | One result row: label, sublabel, status badge, inline switch, action `DropdownMenu`.                                                                                                                                                                                                    |
| `global-search-actions.ts` | Mutation wiring (`RPCLink` client + `setCouponStatus` / `updateProduct`), optimistic + rollback, `router.refresh()`.                                                                                                                                                                    |
| `use-global-search.ts`     | 250 ms debounce, `AbortController`, keep previous results during fetch, merge entity groups + `searchNavPages(q)`.                                                                                                                                                                      |
| `global-search-utils.ts`   | Pure helpers: group ordering (Páginas first, then entities), flatten groups, index math (`next`/`prev`/`home`/`end`), `canMutate(kind, canWrite)`. Unit test in `global-search-utils.test.ts`.                                                                                          |

Href ownership: entity `href` is resolved server-side per kind from `storeSlug` + `id` (or `label` for taxonomy pages, `encodeURIComponent` for the `q` value); page `href` comes from `nav-config.ts` client-side. `global-search-utils.ts` builds no hrefs.

| `kind`        | `href`                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| `product`     | `/dashboard/{storeSlug}/catalog/products/{id}`                               |
| `coupon`      | `/dashboard/{storeSlug}/coupons/{id}`                                        |
| `customer`    | `/dashboard/{storeSlug}/customers/{id}`                                      |
| `category`    | `/dashboard/{storeSlug}/catalog/categories?q={encodeURIComponent(label)}`    |
| `department`  | `/dashboard/{storeSlug}/catalog/departments?q={encodeURIComponent(label)}`   |
| `subcategory` | `/dashboard/{storeSlug}/catalog/subcategories?q={encodeURIComponent(label)}` |
| `tag`         | `/dashboard/{storeSlug}/catalog/tags` (no `?q=` support)                     |
| `badge`       | `/dashboard/{storeSlug}/catalog/badges` (no `?q=` support)                   |
| `page`        | from `nav-config.ts`, client-side                                            |

Mount: `(dashboard)/dashboard/[storeSlug]/layout.tsx` inside the header block (after `<HeaderActions />`, ~line 104).

### Keyboard contract

- `Ctrl/Cmd+K` toggles from anywhere in the dashboard (ignore when a text field owns the event? No — toggle always; `Esc` closes from the input too).
- `↓`/`↑` move `aria-activedescendant`; `Home`/`End` jump; `Enter` opens the focused item's `href`.
- `Esc` closes; focus returns to the element that opened the palette (store it on open).
- `Tab` moves from the listbox into the active row's action controls; `Shift+Tab` back. Only the active row's switch and menu trigger are in the tab order (`tabIndex={-1}` on every non-active row's controls, roving model) — `Tab` reaches exactly the active row. The inline switch is a real Base UI `Switch`.
- Capability: when `canWrite === false`, switches are disabled with a "Sem permissão" explanation; the flag is UI-only.
- `aria-live="polite"` region announces `N resultados` / `Nenhum resultado`.
- Reduced motion: no entrance animation classes (`animate-in` is inert anyway — do not add).

### Behavior

- Min 2 chars after trim; below → empty state (quick nav), no request.
- Debounce 250 ms; abort the previous request; keep previous results visible with a `Spinner` in the input group.
- Pages come from `searchNavPages(q, basePath)` in `nav-config.ts`: no request, merged first under "Páginas", never truncated (no "Ver todos").
- Per-group "Ver todos" link only when `items.length === 5` and a `?q=` deep link exists (products, coupons, departments, categories, subcategories) — pass the query through.
- Error state: `Alert` inside the list with a "Tentar de novo" button (`role="status"` for the message).
- No results: `Empty` with the query echoed.
- Mobile: trigger is icon-only; dialog near full-width (`calc(100vw-1rem)`), `max-h` with `ScrollArea`, no horizontal overflow at 360 px.

### Quick actions

- Coupon: inline `Switch` `Ativar`/`Desativar`; disabled with tooltip/`sublabel` when expired ("Cupom expirado"). Dropdown: `Ir para página do cupom`, `Copiar código`, `Desativar`/`Ativar`.
- Product: inline `Switch` availability (`updateProduct` partial, `available`). Dropdown: `Ir para página do produto`, `Abrir em nova aba` where the route supports it, `Copiar nome`.
- Tag/category/department/badge/customer: navigation only; dropdown `Abrir` + `Copiar` (name / e-mail) where meaningful.
- Optimistic toggle → on error rollback + inline `role="status"` message (no toast); control disabled while pending; success → `router.refresh()` so the underlying table reflects it.
- pt-BR copy (exact strings): `Buscar no painel…`, `Nenhum resultado para “{q}”`, `Resultados`, `Páginas`, `Produtos`, `Cupons`, `Clientes`, `Tags`, `Categorias`, `Departamentos`, `Etiquetas`, `Subcategorias`, `Ver todos`, `Ativar`, `Desativar`, `Cupom expirado`, `Copiar código`, `Copiar e-mail`, `Ir para página do cupom`, `Ir para página do produto`, `Tentar de novo`, `Abrir`, `Abrir em nova aba`.

## Security / tenancy

- Client `storeSlug` is untrusted: the API re-resolves the store and scopes every query with `inTenantScope`.
- Customer results expose only what the customers table already shows; no full e-mail lists, no bulk export.
- Writes are capability-gated (`catalog:write`); `canWrite` from the search response only disables UI — `setCouponStatus`/`updateProduct` re-check with `requireCapability`. Read-only roles see switches disabled with an explanation, not hidden silently.
- Error codes mapped to pt-BR copy; no raw DB error text in the palette.

## Steps

- [x] S1 Add `PanelSearchKind/Input/Output/Item` schemas + types (`canWrite`, no total) + OpenAPI meta; `setCouponStatus` input/leaf already exist (coupons rework), do not duplicate | files: `packages/shared/src/panel/contracts.ts`, `packages/shared/src/tenant/index.ts` | owner: implementer | verify: `bun run typecheck` | P1
- [x] S2 Implement `search.impl.ts` (entities only, `canWrite`) + `search-rank.ts` + `search-rank.test.ts` — window 20 → rank → slice 5; total cap 30 | files: `packages/api-tenant/src/domains/tenant/subdomains/panel/search.impl.ts`, `search-rank.ts`, `search-rank.test.ts` | owner: implementer | verify: `bun test packages/api-tenant` | P1b
- [x] S3 Reuse existing `setCouponStatus.impl.ts` (landed with the coupons rework): `requireCapability(store.role, "catalog:write")`, tenant scope, expired activation rejected — verified by reading; no new code | files: `packages/api-tenant/src/domains/tenant/subdomains/panel/setCouponStatus.impl.ts` | owner: implementer | verify: `bun test packages/api-tenant` | P1b
- [x] S4 Wire `search` into the panel router (`setCouponStatus` is already wired) | files: `packages/api-tenant/src/domains/tenant/subdomains/panel/router.ts` | owner: implementer | verify: `bun run typecheck` | P2
- [x] S5 Add infra-backed test for search scoping + coupon status gate (runs the whole integration set) — new suite 10/10 pass; whole set 652 pass with one pre-existing unrelated team-fixture failure | files: `packages/api-tenant/test/panel-search.test.ts` | owner: implementer | verify: `bun run test:integration` | P2b
- [x] S6 Reviewer gate: contracts, impls, router, OpenAPI meta, tenancy — approve, 6 non-blocking findings (test coverage gaps, SQL limit-before-rank, no total cap, dead type exports) | files: `packages/shared/src/panel/contracts.ts`, `packages/api-tenant/src/domains/tenant/subdomains/panel/*` | owner: reviewer | verify: none (review) | P3
- [x] S7 Verify backend: typecheck + package tests — `bun check` 166 files clean, 144 pass/22 skip/0 fail, ranking 4 pass, narrow integration 13 pass; root typecheck still blocked by pre-existing `db:generate` EPERM | files: same as S1–S5 | owner: verifier | verify: `bun run typecheck && bun test packages/api-tenant` | P4
- [x] S8 Extract `nav-config.ts` (`groups`, `SETTINGS_CHILDREN`, `searchNavPages`) from `app-sidebar.tsx`; sidebar consumes it (no behavior change) — 19 pages, slug hrefs, sidebar unchanged | files: `.../_components/app-sidebar.tsx`, `.../_components/nav-config.ts` | owner: implementer | verify: `bun run typecheck` | P1
- [x] S9 Pure helpers + unit test (`global-search-utils.ts`, `apps/web/tests/global-search-utils.test.ts`) — group merge/order, index math, `canMutate`; no hrefs | files: `.../_components/global-search-utils.ts`, `apps/web/tests/global-search-utils.test.ts` | owner: implementer | verify: `bun test apps/web` | P1
- [x] S10 Build palette UI: trigger, dialog, row, hook (`global-search.tsx`, `global-search-dialog.tsx`, `global-search-row.tsx`, `use-global-search.ts`) — read-only, no mutations | files: `.../_components/global-search.tsx`, `global-search-dialog.tsx`, `global-search-row.tsx`, `use-global-search.ts` | owner: implementer | verify: `bun run typecheck` | P5
- [x] S11 Quick actions: mutations, optimistic + rollback, dropdown (`global-search-actions.ts`, edits to `global-search-row.tsx`/`-dialog.tsx`) — sequential after S10 | files: `.../_components/global-search-actions.ts`, `global-search-row.tsx`, `global-search-dialog.tsx` | owner: implementer | verify: `bun run typecheck` | P6
- [x] S12 Mount in dashboard header + a11y polish (focus restore, `aria-activedescendant`, `aria-live`, mobile width) | files: `(dashboard)/dashboard/[storeSlug]/layout.tsx`, `.../_components/global-search.tsx` | owner: implementer | verify: `bun run typecheck` | P7
- [x] S13 Reviewer gate: web palette (a11y, tokens, copy, no new deps) — approve after fixes; doc gotcha corrected | files: `.../_components/global-search*.tsx`, `global-search-actions.ts`, `use-global-search.ts`, `nav-config.ts`, `layout.tsx` | owner: reviewer | verify: none (review) | P8
- [~] S14 Verify web + canonical checks | files: all changed | owner: verifier | verify: `bun run design:check && bun run typecheck && bun test && bun run lint && bun run fmt:check && bun run build` | P9
- [x] S15 Document dashboard search in the menuza skill: new `engineering/dashboard-search.md` + router/index rows | files: `.agents/skills/menuza/engineering/dashboard-search.md`, `.agents/skills/menuza/engineering/INDEX.md`, `.agents/skills/menuza/INDEX.md`, `.agents/skills/menuza/SKILL.md` | owner: implementer | verify: `bunx oxfmt --check .agents/skills/menuza/engineering/dashboard-search.md .agents/skills/menuza/engineering/INDEX.md .agents/skills/menuza/INDEX.md .agents/skills/menuza/SKILL.md` | P8

## Parallel

- P1: S1, S8, S9 — disjoint files (`contracts.ts` vs web `_components/`).
- P1b: S2, S3 (after S1 — both import the schemas S1 adds; different files).
- P2: S4 — router wiring.
- P2b: S5 (after S4 — exercises the wired router).
- P3: S6 (after S1–S5).
- P4: S7 (after S6).
- P5: S10 (after S4, S8, S9).
- P6: S11 (after S10 — same files, sequential).
- P7: S12 (after S11).
- P8: S13, S15 (after S12 — disjoint files: app palette vs skill docs).
- P9: S14 (after S13 and S15).

## Verification matrix

| Area                            | Check            | Command                                                                                                                                                                             |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts                       | typecheck        | `bun run typecheck`                                                                                                                                                                 |
| API unit + ranking              | bun test         | `bun test packages/api-tenant`                                                                                                                                                      |
| API integration (scoping, gate) | infra, whole set | `bun run test:integration`                                                                                                                                                          |
| Web helpers                     | bun test         | `bun test apps/web`                                                                                                                                                                 |
| Design tokens / dashboard UI    | design gate      | `bun run design:check`                                                                                                                                                              |
| Lint / format                   | oxlint/oxfmt     | `bun run lint && bun run fmt:check`                                                                                                                                                 |
| Skill docs                      | oxfmt check      | `bunx oxfmt --check .agents/skills/menuza/engineering/dashboard-search.md .agents/skills/menuza/engineering/INDEX.md .agents/skills/menuza/INDEX.md .agents/skills/menuza/SKILL.md` |
| Full build                      | Next + Bun       | `bun run build`                                                                                                                                                                     |

### Manual QA (no Playwright in repo)

- Keyboard only: open with `Ctrl+K` and `⌘K`, navigate with arrows/Home/End, `Enter`, `Esc`, `Tab` reaches only the active row's switch and menu trigger, focus restored to the trigger.
- Pages: "Páginas" group appears without a network request; entity groups still render when only a page matches.
- Screen reader: `aria-live` announces result count; row labels read `label — sublabel — status`.
- 360 px viewport: no horizontal overflow, list scrolls inside the dialog.
- Slow network: previous results stay, spinner shows, typing aborts the stale request.
- Expired coupon: switch disabled, explanation visible, `setCouponStatus` rejected server-side too.
- Role without `catalog:write`: switch disabled with explanation.
- Store switch (two stores): results never leak across stores.

## Risks / not doing

| Risk                                                                 | Mitigation / default                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ILIKE '%q%'` full scans on large catalogs                           | Accept v1; measure with `EXPLAIN`; follow-up `pg_trgm` + GIN                |
| Accent-insensitive expectations ("cafe" vs "café")                   | Documented non-goal; follow-up normalized column or `unaccent`              |
| Orders in v1 results                                                 | Not doing; the Pedidos page is still searchable as a page                   |
| Taxonomy switches                                                    | Not doing; full-payload updates risk clobbering                             |
| Recents                                                              | Not doing; empty state = quick nav                                          |
| `command` primitive conflict (`DESIGN.md` vs `components/AGENTS.md`) | Base UI hand-build (D3); revisit if cmdk is ever allowed                    |
| Coupon stale overwrite                                               | Narrow `setCouponStatus` (D4) instead of full update                        |
| Ranking drift / non-determinism                                      | Pure ranking helper + unit test; prefix-first then `localeCompare("pt-BR")` |
| Keyboard trap regressions                                            | Explicit keyboard contract + manual keyboard-only QA                        |
