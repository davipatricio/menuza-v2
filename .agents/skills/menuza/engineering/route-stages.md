# Route rendering stages (apps/web)

Give each `apps/web` route the cheapest stage that still renders the right UI, then leave a guard so a later edit cannot quietly make it more expensive. Concept reference is offline at `node_modules/next/dist/docs/01-app/02-guides/keeping-pages-static.md` and `.../optimizing-prefetching.md`. Read `apps/web/AGENTS.md` first.

## Stages

`cacheComponents` and `partialPrefetching` are on app-wide, so Next produces a route's output in stages, cheapest first:

1. **Static prerender** — built ahead of any request.
2. **App Shell** — the part that does not depend on the URL; a default `<Link>` loads it.
3. **Per-link prefetch** — optional; `<Link prefetch={true}>` may add URL-specific cached content.
4. **Navigation** — everything left renders when the user clicks.

`next build` prints each route as `○` (fully static), `◐` (static shell + streamed content), or `ƒ` (rendered on demand).

## Controls

| Control                                                | Where                            | Effect                                                                              |
| ------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| `ensureStatic = 'navigation' \| 'prefetch' \| 'shell'` | `page.tsx` / `layout.tsx` export | Fails the build unless that stage is static. A child may be stricter, never weaker. |
| `instant = false`                                      | page / layout export             | Turns off Instant Navigation validation for the segment.                            |
| `'use cache'` + `cacheLife(...)`                       | data helper                      | Makes a read prerenderable so it can live in a static stage.                        |
| `await navigation()`                                   | server component                 | Defers below it out of the Shell and per-link prefetch — renders on navigation.     |
| `await prefetch()`                                     | server component                 | Defers below it out of the Shell — renders on a per-link prefetch or navigation.    |
| `<Suspense fallback>`                                  | server component                 | Holds whatever a stage defers; the fallback is what the earlier stage shows.        |

Prerequisites: `ensureStatic` needs `cacheComponents`; `'shell'` and `'prefetch'` need `partialPrefetching`. `navigation()` and `prefetch()` may not be called inside `'use cache'`, `after()`, `generateStaticParams`, or a Client Component.

## When to use which

| Route intent                                                         | Its data                          | Do                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing / content page, same for everyone                          | none                              | `ensureStatic='navigation'` on the group layout                                                                                                                                                                                                                                              |
| Tenant page with a shared shell + per-visitor detail (cart, session) | shell shared; detail request-time | `ensureStatic='shell'` on the layout, detail inside `<Suspense>`                                                                                                                                                                                                                             |
| Expensive reusable content no prefetch should build                  | cacheable                         | `'use cache'` + `navigation()`                                                                                                                                                                                                                                                               |
| Content the Shell must not build but a per-link prefetch may         | cacheable                         | `'use cache'` + `prefetch()`                                                                                                                                                                                                                                                                 |
| Panel data scoped to the signed-in member                            | member-scoped, mutable            | `'use cache: private'` where same-route `router.refresh()` invalidation exists, uncached otherwise; page is a synchronous `instant = true` `<Suspense>` wrapper; products list uncached; no data-bearing App Shell; `prefetch()`/`navigation()` unused; product rows hover `prefetch={true}` |

## menuza map

- `src/app/(marketing)/` — fully static. `layout.tsx` exports `ensureStatic='navigation'`. A cookie/header/uncached read here fails the build: keep it static, or move the route out and pick a weaker level deliberately.
- `src/app/(storefront)/store/` — `layout.tsx` exports `ensureStatic='shell'`. The commerce status card (`components/commerce-status-card.tsx`) is an uncached `fetch` already behind `<Suspense>`, so it stays out of the Shell on its own.
- `src/app/(dashboard)/` — dynamic by design: the layout awaits `params.storeSlug` and reads store/session per request, so there is **no data-bearing App Shell** and `instant = false` stays. Every page is a synchronous `instant = true` `<Suspense>` wrapper. Private caches: lists 300s, form taxonomy + editor product/SEO 30s; products list uncached; tags inert by design. Never cache member-scoped data into a shared server cache.
- Root `src/app/layout.tsx` — shared with the dashboard, so it carries no `ensureStatic`. A route-wide requirement goes on a route-group layout instead.
- `src/app/serwist/[path]/route.ts` — a route handler, always `ƒ`; not part of this ladder.

## Dashboard caching and prefetching

`'use cache: private'` is for member-scoped panel data only. Plain `'use cache'` is rejected there: it cannot call `cookies()`, a passed-in session token would become a server-cache key, there is no `revalidateTag` caller, and `router.refresh()` never touches a server cache.

There is no data-bearing App Shell. The layout awaits `params.storeSlug`, and an App Shell is shared across links and cannot include URL data (`adopting-partial-prefetching.md:79,87`); anything behind `params`/`searchParams` is already out of the shell (`prefetch.md:143`). Never label dashboard content "App Shell".

| Surface                 | Directive              | Tag                                         | Lifetime | Invalidation that exists                                                                                    | Stage                                         |
| ----------------------- | ---------------------- | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Departments list        | `'use cache: private'` | `dashboard:departments:{storeSlug}`         | 300s     | same-route dialog + `router.refresh()`; TTL elsewhere                                                       | navigation (client cache; no shell)           |
| Tags list               | `'use cache: private'` | `dashboard:tags:{storeSlug}`                | 300s     | same-route dialog + refresh; TTL                                                                            | navigation                                    |
| Categories list         | `'use cache: private'` | `dashboard:categories:{storeSlug}`          | 300s     | same-route dialog + refresh; TTL                                                                            | navigation                                    |
| Kits list               | `'use cache: private'` | `dashboard:kits:{storeSlug}`                | 300s     | read-only; TTL only                                                                                         | navigation                                    |
| Product form taxonomy   | `'use cache: private'` | `dashboard:taxonomy:{storeSlug}`            | 30s      | TTL only; a taxonomy edit on another route lands ≤30s                                                       | per-link prefetch (editor) / navigation (new) |
| Editor product          | `'use cache: private'` | `dashboard:product:{storeSlug}:{productId}` | 30s      | editor save/delete + refresh; a list availability toggle lands ≤30s                                         | per-link prefetch / navigation                |
| Editor SEO              | `'use cache: private'` | `dashboard:seo:{storeSlug}:{productId}`     | 30s      | SEO save/delete on the editor + refresh; a list bulk delete lands ≤30s, but the 30s product read 404s first | per-link prefetch / navigation                |
| Products list           | none                   | —                                           | none     | none: an editor save refreshes only the editor route, so any client cache would hide the user's own edit    | navigation (always streams)                   |
| Shell (store + session) | none                   | —                                           | —        | read per request; no client cache, no server cache                                                          | request time; never shell-eligible            |

Prefetch value per link:

| Link                               | Destination                                 | Value                                           | Why                                                                                                               |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sidebar primary and settings links | every dashboard route                       | `auto`                                          | no data-bearing App Shell; the default is the baseline                                                            |
| Store switcher                     | `/dashboard/{slug}`                         | `auto`                                          | no URL-data payload; a switch is a rare full-layout change                                                        |
| Product row/card links             | `catalog/products/[productId]`              | hover/focus `prefetch={true}`, `auto` otherwise | resolves the private product + SEO + taxonomy 30s reads; hover bounds the heavy form to one invocation per intent |
| "Novo produto"                     | `catalog/products/new`                      | `auto`                                          | only the small 30s taxonomy; no per-link server work                                                              |
| Department/tag item links          | `catalog/products?department=…` / `?tags=…` | `auto`                                          | the products list is uncached, so a per-link prefetch stops at the same fallback                                  |
| `force-disabled`                   | —                                           | none yet                                        | `settings/*` are the future candidate; no rarely visited in-scope segment                                         |

`router.refresh()` — "This clears the Client Cache for the current route, but does not invalidate the server-side cache." (`use-router.md:46`).

| Change                          | Edited surface                | Elsewhere                                           | Why                         |
| ------------------------------- | ----------------------------- | --------------------------------------------------- | --------------------------- |
| Edit a product                  | editor 0 (`router.refresh()`) | products list 0 (uncached); another tab/editor ≤30s | no cross-route revalidation |
| Toggle availability on the list | list 0                        | editor ≤30s if its product entry is warm            | 30s product cache           |
| Edit a taxonomy item            | that list 0 after refresh     | new/editor form options ≤30s                        | 30s taxonomy cache          |

`instant`: layout `false`; every dashboard page touched here `true`. If the dev overlay names a blocking read, fix the page — do not flip it back.

Tags are inert by design: private results never reach a server cache, and a Server Action revalidation would clear the whole client cache regardless of tag. `cacheTag` is metadata, never an invalidation path.

### Checklist for a new dashboard page

- Synchronous default export returning one `<Suspense>` with the loading fallback.
- `instant = true`.
- `params`, `searchParams` and `panelClient()` awaited only inside the child, via `Promise.all`.
- `'use cache: private'` only when a same-route mutation exists, with the shortest acceptable `stale` (30s floor).
- `cacheTag` for future server invalidation, but never claim it invalidates.
- No data-bearing App Shell claim; per-link `prefetch={true}` only on hover/focus, and only when the destination's data is cached behind a `<Suspense>`.

## Audit

1. List every segment: walk `apps/web/src/app` for `page.tsx`, `layout.tsx`, and `route.ts`.
2. Classify each: note any `cookies()`, `headers()`, `searchParams`, `connection()`, uncached `fetch`, or read outside `'use cache'`. A segment with none can be fully static; one with any is a shell at best.
3. Match each to the table above and set the guard: an `ensureStatic` level, keep or drop `instant=false`, or wrap the deferred part in `<Suspense>` and set `instant = true` on the page. A route whose layout resolves the session/store has no data-bearing App Shell, so `navigation()` / `prefetch()` have nothing to defer there; they apply only when a cached subtree must stay out of an App Shell that exists.
4. Verify with `bun run typecheck`, then `next build`, and read the route table: a `'navigation'` route must print `○`, a `'shell'` route `◐`, and no static route may print `ƒ`. On Windows run the build under Node (`node node_modules/next/dist/bin/next build`) — the Bun runner mis-spawns the TypeScript CLI from the `.bun` store there.

Done when every segment is labeled with a stage, its guard matches the label, and the build's route table agrees.

## Gotchas

- A child segment cannot weaken or invert a parent's `ensureStatic`; parallel routes rendered together must set the same value.
- `'navigation'` on a dynamic route needs `generateStaticParams()` returning at least one complete parameter set, or the build fails.
- `navigation()` / `prefetch()` need a `<Suspense>` boundary to be useful; a call outside one surfaces a development Instant Insight.
- In a file whose route segment config sets `prefetch`, alias the function: `import { prefetch as prefetchStage } from 'next/cache'`.
- A private cache entry survives `router.refresh()` only within the current route; cross-route entries expire by `stale`, so never choose a `stale` longer than the staleness the owner accepts on another route.
