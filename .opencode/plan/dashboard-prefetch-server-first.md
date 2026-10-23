# Make dashboard navigation instant-feeling and cheap to prefetch (server-first pages)

Status: active
Updated: S0

## Non-goals

- No API/contract/db changes, no new packages, no new tests, no Playwright/Vitest.
- No `next.config.ts` flag changes (`cacheComponents` / `partialPrefetching` stay on).
- No storefront, marketing, auth or `/dashboard` (store picker) changes.
- No work on overview, orders, customers, coupons, audit or settings pages (outside approved scope).
- No visual redesign, no deletion of dead code (`catalog/catalog-tabs.tsx` stays).
- No `prefetch={true}` unless a cached URL-data payload exists behind it; none does here.

## Assumptions

- verified: `apps/web/next.config.ts:14-15` sets `cacheComponents: true` and `partialPrefetching: true`.
- verified: layout `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx:16` is `instant = false`; `loadStore` at `:25-36` awaits `panel.getStore` + `session.current` inside one `Promise.all`; `:43-110` renders the shell.
- verified: the seven in-scope pages and their state (all await `params` at top level, none has `<Suspense>`): products `page.tsx:18,27-33`, new `:6,13-21`, `[productId]` `:11,46-48`, departments `:15,22-27`, tags `:20-25`, categories `:11-16`, kits `:11-16`.
- verified: `loadProductSearchParams` (`catalog/products/product-search-params.ts:28`) already accepts the `searchParams` promise.
- verified: the working tree is dirty with in-flight department/tag `active` work (`catalog/departments/page.tsx`, `catalog/tags/page.tsx`, `catalog/_components/taxonomy-dialog.tsx`, `departments-table.tsx`, `tags-table.tsx`, plus API/db); every step preserves it and none reverts or edits the API/db side.
- verified: `loading.tsx` exists in every in-scope segment; products uses `TableLoading`, new/`[productId]` use `SimpleLoading`, departments/tags/categories/kits use a hand-rolled `Skeleton` (`loading.tsx:1-20`).
- verified: no `<Link>` under `(dashboard)` sets `prefetch`; `export const prefetch` appears nowhere under `apps/web/src`.
- verified: `router.refresh()` "clears the Client Cache for the current route" (`use-router.md:46`), and every mutation already calls it.
- verified: `'use cache: private'` is browser-only, per session, never a shared server cache (`use-cache-private.md:14-16`); `stale < 30s` is excluded from prerenders and `stale < 5min` is excluded from the App Shell (`cacheLife.md:262-270`; `use-cache-private.md:154`).
- verified: an ancestor `instant = false` with a deeper `instant = true` is the documented "tabs" pattern; sibling navigations are still validated (`instant.md:67-83`).
- verified: `<Link prefetch={true}>` costs one server invocation per visible link and is skipped when the destination must be fresh (`optimizing-prefetching.md:124,393-403`); `prefetch = 'force-disabled'` omits segment data for that segment and deeper (`prefetch.md:54-58`).
- unverified: that the private-cached layout yields a reusable App Shell in this exact app — no e2e harness exists (Bun only). Verified by build + dev overlay instead.
- unverified: 5 minutes of stale nav chrome is acceptable to the product; 300s is the docs' minimum that buys App Shell inclusion.
- unverified: `router.refresh()` evicts private-cache entries for routes other than the current one — docs scope it to the current route. Residual staleness is recorded below.

## Code map

- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx` — `instant` L16, `loadStore` L25-36, `StoreLayout` L43-110, `Suspense` L85.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/page.tsx` — `instant` L18, body L27-95, `filterProducts`/`sortProducts`/`buildProductTaxonomy` L35-36, `ProductsTable` L87.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/product-search-params.ts` — `loadProductSearchParams` L28.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/new/page.tsx` — `instant` L6, body L13-40, `ProductForm` L34.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/[productId]/page.tsx` — `instant` L11, `loadProduct` L19-37, body L46-90, `ProductCrumb` L53, `ProductTabs` L80.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/departments/page.tsx` | `tags/page.tsx` | `categories/page.tsx` | `kits/page.tsx` — same list shape; departments/tags carry the in-flight `Empty` work and must keep it.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/table-loading.tsx:3` — `TableLoading({ label })`.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/simple-loading.tsx:3` — `SimpleLoading({ label })`.
- `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/_components/app-sidebar.tsx` — nav links L77-92, settings L100-143, `groups` L204-230.
- `apps/web/src/lib/server-tenant.ts:25` — `panelClient(): Promise<TenantClient | null>` (reads `menuza_tenant_sid` at L26).
- `.agents/skills/menuza/engineering/route-stages.md:37` (panel-data row), `:43` (dashboard bullet).
- `apps/web/AGENTS.md:130-138` — "Dashboard data" bullet.
- Offline docs: `apps/web/node_modules/next/dist/docs/01-app/02-guides/optimizing-prefetching.md`, `.../adopting-partial-prefetching.md`, `.../prefetching.md`, `.../03-api-reference/03-file-conventions/02-route-segment-config/{instant,prefetch}.md`, `.../01-directives/use-cache-private.md`, `.../04-functions/cacheLife.md`, `.../04-functions/use-router.md`.

## Target shape

### Rule

A page under `[storeSlug]` must render synchronously; `params`, `searchParams` and `panelClient()` are awaited only inside one `<Suspense>`. One App Shell then serves every URL variant of the route (all product ids, all filter query strings). `loading.tsx` stays unchanged as the route-level fallback.

### Layout (`S1`)

```tsx
import { cacheLife } from "next/cache";
// ...

async function loadStore(storeSlug: string) {
  "use cache: private";
  cacheLife({ stale: 300 });

  const client = await panelClient();
  if (!client) return { kind: "unauthenticated" as const };

  try {
    const [store, session] = await Promise.all([
      client.panel.getStore({ storeSlug }),
      client.session.current(),
    ]);
    return { kind: "ok" as const, store, session };
  } catch {
    return { kind: "not-found" as const };
  }
}

export default async function StoreLayout({ children, params }) {
  const { storeSlug } = await params;
  const shell = await loadStore(storeSlug);

  if (shell.kind === "unauthenticated") redirect("/dashboard/login");
  if (shell.kind === "not-found") notFound();

  const { store, session } = shell;
  // existing JSX unchanged
}
```

`panelClient()` moves inside the cached function: a client instance cannot cross a cache boundary, and `storeSlug` is the only argument, so the entry is keyed per store + session. The discriminated result keeps `redirect()`/`notFound()` outside the cache scope. `params` is the only sequential await in the layout; it resolves without I/O. Drop the now-unused `type TenantClient` import. Keep `export const instant = false` and update the L14-15 comment to name the private cache.

### List page (products, departments, tags, categories, kits)

```tsx
import { Suspense } from "react";
import { TableLoading } from "../../_components/table-loading.tsx";
// ...

export const instant = true;

export default function CatalogDepartmentsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando departamentos" />}>
      <CatalogDepartments params={params} />
    </Suspense>
  );
}

async function CatalogDepartments({ params }: { params: Promise<{ storeSlug: string }> }) {
  const [{ storeSlug }, client] = await Promise.all([params, panelClient()]);
  if (!client) notFound();

  const { departments } = await client.panel.listDepartments({ storeSlug });
  return (/* the existing <section> verbatim, including the in-flight Empty state */);
}
```

Products awaits `Promise.all([params, loadProductSearchParams(searchParams), panelClient()])`, then `listProducts`. Keep the existing `filterProducts(sortProducts(products), filters)` order and `buildProductTaxonomy`.

### Editor pages (`new`, `[productId]`)

```tsx
export const instant = true;

export default function NewProductPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  return (
    <Suspense fallback={<SimpleLoading label="Carregando produto" />}>
      <NewProduct params={params} />
    </Suspense>
  );
}
```

`new`: `Promise.all([params, panelClient()])`, then the three taxonomy calls unchanged. `[productId]`: `Promise.all([params, searchParams, panelClient()])`, then `loadProduct(client, storeSlug, productId)`; give `loadProduct` the `TenantClient` argument instead of calling `panelClient()` inside, and keep its `Promise.all` of `getProduct`/`getSeo`/`listCategories`/`listDepartments`/`listTags`. `ProductCrumb` + section move into the child.

### `instant` per segment

| Segment                             | Today   | After   | Why                                                                                                                                                                       |
| ----------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[storeSlug]/layout.tsx`            | `false` | `false` | still awaits cache/API before rendering; ancestor `false` exempts entry navigations (`instant.md:81`) and turns off the static-shell check for the tree (`instant.md:87`) |
| products list, new, `[productId]`   | `false` | `true`  | page returns a Suspense synchronously; `true` validates that no later edit re-adds a blocking read (`instant.md:47,95`)                                                   |
| departments, tags, categories, kits | none    | `true`  | same guard; the documented deeper-`true`-under-`false` case (`instant.md:67-83`)                                                                                          |

If the dev overlay reports a blocking read on a page, fix the page; do not flip it back to `false`.

### Prefetch policy (no code change; recorded in `S9`)

| Link                                                                                                         | Keep/set         | Why                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar, 10 primary links (`app-sidebar.tsx:83`) + 6 collapsed settings links (`:130,157`)                   | default (`auto`) | one shared App Shell per route, per store (`prefetching.md:87`); bounded by route count                                                                            |
| Product row links to `[productId]` (`products-table.tsx:480,942`)                                            | default          | after `params` moves behind Suspense all rows share one shell                                                                                                      |
| Department/tag links to `products?department=` / `?tags=` (`departments-table.tsx:66`, `tags-table.tsx:122`) | default          | same route, same shell, regardless of query string                                                                                                                 |
| `prefetch={true}`                                                                                            | nowhere          | page data is uncached and member-scoped; the prerender stops at the same fallback while the link costs one server invocation (`optimizing-prefetching.md:124,398`) |
| `export const prefetch = 'force-disabled'`                                                                   | nowhere in scope | reserved for rarely visited segments with no shell reuse (`prefetch.md:56`); settings/* is the future candidate                                                    |

### Doc text (`S9`, `S10`)

`route-stages.md` L37 — replace the single row with:

```md
| Store shell identity (membership, session, store name) | member-scoped, low churn | `'use cache: private'` + `cacheLife({ stale: 300 })`; keep `instant=false` |
| Panel page data (lists, editors) | member-scoped, must stay fresh | uncached, inside `<Suspense>`; page sets `instant=true` |
```

L43 — replace with:

```md
- `src/app/(dashboard)/` — dynamic by design: `[storeSlug]/layout.tsx` sets `instant = false` and resolves the store + session through `'use cache: private'`; every page below it sets `instant = true` and streams its data from one `<Suspense>`. No `ensureStatic`; never cache member-scoped data into a shared server cache (private is browser-only, per session).
```

New `## Dashboard navigation` section, inserted before `## Audit`:

```md
## Dashboard navigation

- The store shell is the only blocking segment; `[storeSlug]/layout.tsx` keeps `instant = false`.
- Every page under the layout is synchronous (`instant = true`) and returns one `<Suspense>` with the route's `TableLoading` (tables) or `SimpleLoading` (forms).
- `params` and `searchParams` are awaited only inside that boundary, so one App Shell serves every URL variant of the route: all product ids, all filter strings.
- Links keep the default prefetch. `prefetch={true}` costs one server invocation per visible link and only pays when the destination resolves cached URL data; panel data is uncached, so it never pays here.
- `prefetch = 'force-disabled'` is for rarely visited segments with no shell reuse (settings, one-off admin routes), never for primary nav.
```

`apps/web/AGENTS.md` L130-138 — replace with:

```md
- Dashboard data: every page under `/dashboard/[storeSlug]` is a Server Component
  that reads through `panelClient()` in `src/lib/server-tenant.ts`, which forwards
  the request's `menuza_tenant_sid` cookie to the tenant API. Tables and tab
  switches are client islands (`*-table.tsx` / `*-tabs.tsx`) that receive rows as
  props — no data fetch in the browser. `[storeSlug]/layout.tsx` is the only
  blocking segment (`export const instant = false`, no `generateStaticParams`): it
  resolves `panel.getStore` + `session.current` inside `'use cache: private'` with
  `cacheLife({ stale: 300 })`, so an unknown slug and a non-member are both 404 and
  a freshly created store opens empty rather than 404ing. Every page below the
  layout is a synchronous shell (`export const instant = true`) that awaits
  `params`/`searchParams`/`panelClient()` inside one `<Suspense>`; links keep the
  default prefetch. `src/lib/panel-labels.ts` is the only place the contract's
  ASCII enums become pt-BR, and `formatBrl` takes cents (ADR-0006).
```

## Steps

- [ ] S1 Cache the shell identity and split redirect from 404 | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx` | exact change: `loadStore(storeSlug)` gets `"use cache: private"` + `cacheLife({ stale: 300 })`, calls `panelClient()` itself, returns the three-arm result above; `StoreLayout` maps `unauthenticated` → `redirect`, `not-found` → `notFound`, keeps `instant = false`, drops the `TenantClient` type import, updates the L14-15 comment to "The shell resolves the store and session through a private, browser-only cache; the read still blocks instead of prerendering a shell for a fixed set of slugs." | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx" && bun run typecheck` | P1
- [ ] S2 Make the products list a synchronous shell | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/page.tsx` | exact change: `instant = true`; default export returns `<Suspense fallback={<TableLoading label="Carregando produtos" />}>`; async child awaits `Promise.all([params, loadProductSearchParams(searchParams), panelClient()])` then `listProducts`; existing section/Empty/`ProductsTable` verbatim; import `Suspense` from `react` and `TableLoading` from `../../_components/table-loading.tsx` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/page.tsx" && bun run typecheck` | P2
- [ ] S3 Same shape for departments, keeping the dirty Empty state | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/departments/page.tsx` | exact change: `instant = true`; Suspense fallback `<TableLoading label="Carregando departamentos" />`; child awaits `Promise.all([params, panelClient()])` then `listDepartments`; keep `TaxonomyCreateDialog`, `Empty` and `DepartmentsTable` exactly as they are | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/departments/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/departments/page.tsx" && bun run typecheck` | P2
- [ ] S4 Same shape for tags, keeping the dirty Empty state | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/tags/page.tsx` | exact change: add `instant = true`; Suspense fallback `<TableLoading label="Carregando tags" />`; child awaits `Promise.all([params, panelClient()])` then `listTags` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/tags/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/tags/page.tsx" && bun run typecheck` | P2
- [ ] S5 Same shape for categories | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/categories/page.tsx` | exact change: add `instant = true`; Suspense fallback `<TableLoading label="Carregando categorias" />`; child awaits `Promise.all([params, panelClient()])` then `listCategories` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/categories/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/categories/page.tsx" && bun run typecheck` | P2
- [ ] S6 Same shape for kits | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/kits/page.tsx` | exact change: add `instant = true`; Suspense fallback `<TableLoading label="Carregando kits" />`; child awaits `Promise.all([params, panelClient()])` then `listKits`; keep the read-only `Alert` | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/kits/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/kits/page.tsx" && bun run typecheck` | P3
- [ ] S7 Make the product create route synchronous | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/new/page.tsx` | exact change: `instant = true`; Suspense fallback `<SimpleLoading label="Carregando produto" />` (import `../../../_components/simple-loading.tsx`); child awaits `Promise.all([params, panelClient()])` then the existing three taxonomy calls; heading + `ProductForm` move into the child | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/new/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/new/page.tsx" && bun run typecheck` | P3
- [ ] S8 Make the product editor route synchronous | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/[productId]/page.tsx` | exact change: `instant = true`; Suspense fallback `<SimpleLoading label="Carregando produto" />`; child awaits `Promise.all([params, searchParams, panelClient()])` then `loadProduct(client, storeSlug, productId)`; pass the client into `loadProduct` (`loadProduct(client: TenantClient, storeSlug, productId)`, import `type TenantClient` from `@/lib/server-tenant.ts`) and delete its internal `panelClient()`/null branch; `ProductCrumb` + section move into the child | owner: implementer | verify: `bunx oxfmt "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/[productId]/page.tsx" && bunx oxlint "apps/web/src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/[productId]/page.tsx" && bun run typecheck` | P3
- [ ] S9 Record the pattern in the route-stages skill | files: `.agents/skills/menuza/engineering/route-stages.md` | exact change: apply the three edits in `### Doc text` — replace L37 with the two rows, replace L43 with the dashboard bullet, insert the `## Dashboard navigation` section before `## Audit` | owner: implementer | verify: `bunx oxfmt ".agents/skills/menuza/engineering/route-stages.md"` | P3
- [ ] S10 Update the dashboard data rule in apps/web/AGENTS.md | files: `apps/web/AGENTS.md` | exact change: replace L130-138 with the `apps/web/AGENTS.md` block in `### Doc text` | owner: implementer | verify: `bunx oxfmt "apps/web/AGENTS.md"` | P3
- [ ] S11 Run the Definition-of-Done chain and read the route table | files: none (verification only) | exact change: run the chain; from `apps/web` run `node node_modules/next/dist/bin/next build` (Bun's runner mis-spawns the TS CLI on Windows); read the `Route (app)` table and record every `/dashboard/[storeSlug]/...` line: none may be `○`, touched routes must still appear, and the build must not error. `bun run lint` may report the five pre-existing table-file findings documented in `apps/web/AGENTS.md`; record them as pre-existing, do not fix. If infra is up, load each touched route in `next dev` and confirm the overlay names no blocking read on them | owner: verifier | verify: `bun run design:check && bun run typecheck && bun test && bun run lint && bun run fmt:check && cd apps/web && node node_modules/next/dist/bin/next build` | P4

## Parallel

- P1: S1
- P2: S2, S3, S4, S5
- P3: S6, S7, S8, S9, S10
- P4: S11

`bun run typecheck` is the only shared write (Next typegen under `apps/web/.next`). If a group runs concurrently, run the per-file `oxfmt`/`oxlint` per step and let the orchestrator run one `bun run typecheck` after the group's editors finish.

## Risks / Not doing

- No automated proof of prefetch behavior: Bun only, no Playwright. Evidence is the build route table plus the dev overlay.
- The private-cached shell can show up to 5 minutes of stale nav chrome (store name, role, membership list) in a tab that did not perform the mutation; `router.refresh()` clears the current route's client cache and every mutation calls it. If that trade is rejected, the safer option is to drop S1 only: the layout keeps its blocking read and `instant = false`, and S2-S10 still deliver shared, URL-independent shells.
- In dev, `'use cache: private'` is kept in memory and may briefly serve stale output; production is browser-only, never a shared server cache.
- Page data stays uncached by design (member-scoped, must be fresh); a cold tenant API still costs a round trip behind the fallback.
- Overview, orders, customers, coupons, audit and settings keep the old shape; the new rule in `route-stages.md` covers them as follow-ups.
- `catalog/catalog-tabs.tsx` is dead code (no importer); left in place.
- Departments/tags/categories/kits switch their client-navigation fallback from the hand-rolled skeleton to `TableLoading` (DESIGN.md's table convention); their `loading.tsx` files stay as they are. Aligning the four files to `TableLoading` is a follow-up.
