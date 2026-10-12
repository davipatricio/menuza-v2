---
name: menuza-route-stages
description: >
  Audit and set the rendering stage of every route in apps/web. Use when adding
  or changing a page, layout, or route handler under apps/web/src/app, deciding
  whether a route should be static, cached, or request-time, choosing between
  ensureStatic, instant, 'use cache'/cacheLife, navigation(), and prefetch(), or
  when a route — or a prefetch into it — renders at request time unexpectedly.
---

# menuza-route-stages

Give each `apps/web` route the cheapest stage that still renders the right UI, then leave a guard so a later edit cannot quietly make it more expensive. Concept reference is offline at `node_modules/next/dist/docs/01-app/02-guides/keeping-pages-static.md` and `.../optimizing-prefetching.md`. Read `apps/web/AGENTS.md` first: it holds the group rules this skill applies.

## Stages

`cacheComponents` and `partialPrefetching` are on app-wide, so Next produces a route's output in stages, cheapest first:

1. **Static prerender** — built ahead of any request.
2. **App Shell** — the part that does not depend on the URL; a default `<Link>` loads it.
3. **Per-link prefetch** — optional; `<Link prefetch={true}>` may add URL-specific cached content.
4. **Navigation** — everything left renders when the user clicks.

`next build` prints each route as `○` (fully static), `◐` (static shell + streamed content), or `ƒ` (rendered on demand).

## Controls

| Control | Where | Effect |
| --- | --- | --- |
| `ensureStatic = 'navigation' \| 'prefetch' \| 'shell'` | `page.tsx` / `layout.tsx` export | Fails the build unless that stage is static. A child may be stricter, never weaker. |
| `instant = false` | page / layout export | Turns off Instant Navigation validation for the segment. |
| `'use cache'` + `cacheLife(...)` | data helper | Makes a read prerenderable so it can live in a static stage. |
| `await navigation()` | server component | Defers below it out of the Shell and per-link prefetch — renders on navigation. |
| `await prefetch()` | server component | Defers below it out of the Shell — renders on a per-link prefetch or navigation. |
| `<Suspense fallback>` | server component | Holds whatever a stage defers; the fallback is what the earlier stage shows. |

Prerequisites: `ensureStatic` needs `cacheComponents`; `'shell'` and `'prefetch'` need `partialPrefetching`. `navigation()` and `prefetch()` may not be called inside `'use cache'`, `after()`, `generateStaticParams`, or a Client Component.

## When to use which

| Route intent | Its data | Do |
| --- | --- | --- |
| Marketing / content page, same for everyone | none | `ensureStatic='navigation'` on the group layout |
| Tenant page with a shared shell + per-visitor detail (cart, session) | shell shared; detail request-time | `ensureStatic='shell'` on the layout, detail inside `<Suspense>` |
| Expensive reusable content no prefetch should build | cacheable | `'use cache'` + `navigation()` |
| Content the Shell must not build but a per-link prefetch may | cacheable | `'use cache'` + `prefetch()` |
| Panel data scoped to the signed-in member | request-time only | stay dynamic; keep `instant=false`; no `ensureStatic` |

## menuza map

- `src/app/(marketing)/` — fully static. `layout.tsx` exports `ensureStatic='navigation'`. A cookie/header/uncached read here fails the build: keep it static, or move the route out and pick a weaker level deliberately.
- `src/app/(storefront)/store/` — `layout.tsx` exports `ensureStatic='shell'`. The commerce status card (`components/commerce-status-card.tsx`) is an uncached `fetch` already behind `<Suspense>`, so it stays out of the Shell on its own.
- `src/app/(dashboard)/` — dynamic by design: every page sets `instant=false`, and `[storeSlug]/layout.tsx` resolves `panel.getStore` per request so an unknown slug and a non-member are both 404. No `ensureStatic`; never cache member-scoped data into a shared cache.
- Root `src/app/layout.tsx` — shared with the dashboard, so it carries no `ensureStatic`. A route-wide requirement goes on a route-group layout instead.
- `src/app/serwist/[path]/route.ts` — a route handler, always `ƒ`; not part of this ladder.

## Audit

1. List every segment: walk `apps/web/src/app` for `page.tsx`, `layout.tsx`, and `route.ts`.
2. Classify each: note any `cookies()`, `headers()`, `searchParams`, `connection()`, uncached `fetch`, or read outside `'use cache'`. A segment with none can be fully static; one with any is a shell at best.
3. Match each to the table above and set the guard: an `ensureStatic` level, keep or drop `instant=false`, or wrap the deferred part in `<Suspense>` and call `navigation()` / `prefetch()`.
4. Verify with `bun run typecheck`, then `next build`, and read the route table: a `'navigation'` route must print `○`, a `'shell'` route `◐`, and no static route may print `ƒ`. On Windows run the build under Node (`node node_modules/next/dist/bin/next build`) — the Bun runner mis-spawns the TypeScript CLI from the `.bun` store there.

Done when every segment is labeled with a stage, its guard matches the label, and the build's route table agrees.

## Gotchas

- A child segment cannot weaken or invert a parent's `ensureStatic`; parallel routes rendered together must set the same value.
- `'navigation'` on a dynamic route needs `generateStaticParams()` returning at least one complete parameter set, or the build fails.
- `navigation()` / `prefetch()` need a `<Suspense>` boundary to be useful; a call outside one surfaces a development Instant Insight.
- In a file whose route segment config sets `prefetch`, alias the function: `import { prefetch as prefetchStage } from 'next/cache'`.
- Keep user-facing copy in `pt-BR`, and never read the database from `apps/web` — data comes through the internal APIs.
