# apps/web — AGENTS.md

The Menuza web app: TanStack Start (Start + Router + Query) on Vite, React 19,
TypeScript 7, Tailwind 4 with Base UI shadcn components. One app, three
surfaces:

- `src/routes/_marketing/**` — public marketing pages (`/`, `/about`,
  `/pricing`, `/contact`). Static by construction: no loader, no request read.
- `src/routes/_storefront/**` — buyer-facing store (`/store`, `/menu`,
  `/menu/$productId`). The layout resolves the tenant from the request host once
  and 404s when the host owns no store.
- `src/routes/dashboard/**` — store admin (`/dashboard`, `/dashboard/login`,
  `/dashboard/[storeSlug]/**`). This is the bulk of the app.

Nothing added here may import from Next.js; the app is TanStack Start on Vite.

Parent rules: `/AGENTS.md` (repo-wide) and `src/routes/AGENTS.md` (route file
conventions). Dashboard visual rules: `DESIGN.md` in this folder.

## Layout

- `src/routes/**` — thin routes: one `Route` export, one component, `head` with
  `pageTitle(...)`. Data comes from a loader that calls a server function.
- `src/features/<domain>/{server,components,lib}` — `server/*.functions.ts`
  holds `createServerFn` reads/writes; `components/*` are islands and pure
  presentational pieces. One folder per product area: assistant, audit, auth,
  catalog, coupons, customers, integrations, marketing, orders, settings, shell,
  storefront.
- `src/server/**` — server-only plumbing (panel/storefront clients, host
  resolution, proxies, SEO origin). Never imported by a route or component;
  see `src/server/AGENTS.md`.
- `src/lib/**` — framework-agnostic helpers (formatting, labels, CSV, SEO
  titles and JSON-LD, session client, sw cache rules).
- `src/offline/**` — IndexedDB mutation queue, persister and Background Sync
  client. `src/sw.ts` is the service worker, built by `serwistWorker()` in
  `vite.config.ts`.
- `src/components/ui/**` — shadcn (Base UI variant) primitives. Prefer an
  existing primitive over a new one.

## Data flow

- Reads: `createServerFn({ method: "GET" })` with a valibot `.validator(...)`
  and a `.handler(...)` that returns either the payload or a discriminated
  result (`{ status: "ok" | "unauthenticated" | "not-found" }`). The route loader
  maps `unauthenticated` to `throw redirect({ href: "/dashboard/login" })` and
  `not-found` to `notFound()`.
- Writes: islands call a `createServerFn({ method: "POST" })` from
  `src/features/<domain>/server/*.functions.ts` through a TanStack Query
  mutation, then `await router.invalidate()` so the loader re-runs. There is no
  `revalidatePath` and no server action.
- Client components never fetch on mount: the loader already read the data and
  hands it down as typed props.
- `staleTime` is only set for the product editor and the product-create
  taxonomy options (`30_000`). List reads stay uncached so a reload reflects the
  panel.
- Never trust a client-supplied tenant id. The host decides the tenant
  (`src/server/tenant-resolve.ts`), the layout passes `storeSlug` down, and the
  API re-checks the session anyway.

## Search params

Routes that need URL state (orders board, product list) declare:

```ts
// SAFETY: nuqs validates the shape through `validateSearch` below.
validateSearch: (search) => search as SearchParams,
loaderDeps: ({ search }) => search,
```

and the **loader** parses the raw search with `load*SearchParams(deps)`.
Parsing inside `validateSearch` rewrites the URL and causes a canonicalising 307. Islands then use
`useQueryStates(schema, { shallow: false, history: "replace", scroll: false })`.

## Dashboard UI conventions

- pt-BR copy everywhere; semantic tokens only (`bg-background`,
  `text-muted-foreground`, `border-border`), never raw palette classes.
- Spacing with `gap-*` on a flex/grid parent, not `space-y-*`.
- Overlays (`Dialog`, `Sheet`, `AlertDialog`, `Popover`, `DropdownMenu`) always
  carry a `Title`; a `Button` used as a link is
  `Button render={<Link to="…" params={{…}} aria-label="…" />}` with the
  accessible name on the `Link`.
- Tables are `DataTable` + `dashboardTableFeatures` (`src/components/ui/data-table.tsx`).
  Each feature owns its column defs (`ColumnDef` type-only import from
  `@tanstack/react-table`), toolbar state and CSV via `@/lib/csv-export.ts`.
  Do not hand-roll a `<table>` for a list screen.
- A checkbox outside `src/components/ui/**` is labelled with
  `Field orientation="horizontal"` + `Checkbox id` + `FieldLabel htmlFor`
  (Base UI renders a `<button>`, so a wrapping `<label>` breaks
  `jsx-a11y/label-has-associated-control`).
- Dates are `Popover` + `Calendar` (react-day-picker); `<input type="date">` is
  banned.
- Images are plain `<img>` with explicit dimensions or an `aspect-*` wrapper;
  add `// eslint-disable-next-line nextjs/no-img-element` for the rule that still
  ships with the shared config. Above-the-fold hero images get
  `fetchPriority="high"`.
- Loading states are route-level pending components (`defaultPendingComponent`)
  or `Skeleton`; there is no `loading.tsx` equivalent. Errors go to
  `ErrorBoundary` (`defaultErrorComponent`), which also reports to Sentry.
- Forms use `@tanstack/react-form` with the shared valibot schema:
  `const schema: any = …Schema;` plus a reason comment beats per-validator
  casts. Field errors come from `@/lib/form-errors.ts`.
- `design:check` (`bun run design:check`) scans dashboard routes only.

## Komi assistant (dashboard)

Mock-only assistant with canned pt-BR replies, a 700ms abortable delay and
keyword routing; `InMemoryThreadListAdapter` and `KomiThreadListAdapter` seed the
thread title "Komi". Mounted once in the dashboard `[storeSlug]` layout after
`</SidebarInset>`; floating launcher `fixed end-4 bottom-4 size-11`, 400px
panel. Vendored `src/components/assistant-ui/elements/**` deltas to preserve:
pt-BR strings, the removed duplicate sr-only label, no attachment button,
`justify-end` composer row, `outline-hidden!` + `focus-within:border-ring/60`,
and the sheen sweep (`motion-reduce:hidden`). No attachment, voice, feedback,
branch or export adapters. `animate-in`/`fade-in-0`/`zoom-in-95` are inert here
(no `tw-animate-css`).

## Auth

`/dashboard/login` and `/dashboard/signup/*` (conta → perfil → escolha →
loja | convite) call the same-origin `/tenant/...` REST routes through
`src/lib/session-client.ts`. The session cookie is httpOnly; the client never
reads it. Every dashboard layout loader redirects to `/dashboard/login` when
`panelClient()` returns `null`.

## Build, lint, checks

- `bun run --filter '@menuza/web' build` — Vite build; also emits
  `dist/client/serwist/sw.js` (see `serwistWorker()` in `vite.config.ts`).
- `bun run --filter '@menuza/web' typecheck` — `bun check`.
- Build before typecheck after adding or renaming a route: the route tree is
  generated by the router plugin.
- Format and lint only the paths a change touches:
  `bunx oxfmt <paths>` then `bunx oxlint <paths>`.
  `anti-slop/require-readable-spacing` is autofixable (`bunx oxlint --fix`); run
  the formatter afterwards and confirm a second pass changes nothing.
- Every type assertion needs a `// SAFETY:` line above it.
- Repo-wide `bun run lint` still shows warn-only sonarjs complexity findings;
  judge by the touched paths.
- Server-only rule (enforced by `.oxlintrc.json` `no-restricted-imports`):
  routes may not import `@/server/*`. The browser reaches the Rust APIs only
  through `createServerFn` in `src/features/<domain>/server/*.functions.ts`; the
  generated clients in `src/lib/api/**` are called from those functions and from
  `src/server/**`, never from a route or component.
