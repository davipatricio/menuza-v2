# apps/web/src/routes

File-based routes for TanStack Router, consumed by `src/router.tsx`. Parent doc:
`../../AGENTS.md`. Conventions below are not optional — the router plugin only understands
these filenames.

## File conventions

- `__root.tsx` — the document shell (`<html>`/`<head>`/`<body>`, `HeadContent`, `Scripts`)
  and the providers (`ThemeProvider`, `QueryProvider`, `NuqsAdapter`). One per tree;
  everything else renders inside its `<Outlet />`.
- `route.tsx` — a pathless layout for its directory: it renders the shared chrome and an
  `<Outlet />`, and children inherit its `beforeLoad` context. Use it for headers, tabs and
  guards that cover a whole section.
- `index.tsx` — the directory's own path (`/`, `/dashboard`). Not `route.tsx` with a
  component.
- `$param.tsx` — one dynamic segment: `$storeSlug`, `$orderCode`. Read it with
  `Route.useParams()`; it is typed from the filename.
- `$.tsx` — the splat/catch-all for the directory. The match lands in
  `params._splat` (a `string`, leading slash already trimmed), so parse it yourself.
- `-` prefix — `-components/`, `-helpers.ts` are **not** routes. Anything colocated beside a
  route that the router must ignore starts with `-`.

Every route file calls `createFileRoute("<full path>")` with a literal string; the plugin
generates `src/routeTree.gen.ts` (never edit it, never commit-edit by hand).

## Thin-route rule

A route file stays **≤60 lines**, exports exactly one `Route`, and holds one component. No
business logic, no fetch loops, no formatting of contract enums. Real work lives in
`src/features/<domain>/` (components, hooks, schemas, `lib/`), sorted by domain, not by
route.

## `head` and `pageTitle`

Every route sets `head: () => ({ meta: [...] })`. Titles go through `pageTitle` from
`src/lib/seo/title.ts` (`pageTitle("Catálogo")` → `Catálogo · Menuza`) because TanStack
Start has no Next `title.template`. `__root.tsx` owns the fallback title, description,
`theme-color` and the manifest link — do not repeat them.

## Guards vs the data boundary

`beforeLoad` is **UX, not a data boundary**. Use it to redirect an anonymous visitor
(`throw redirect({ to: "/dashboard/login" })`), seed context that the layout genuinely
needs, and to fail early with `notFound()`. It runs in the browser too, so it can never be
the thing that keeps another tenant's data out — the server procedures do that, on every
call, from the session. A `beforeLoad` that fetches business data is a bug: put the read in
a loader or a `*.functions.ts` call.

## Loaders

Loaders are **isomorphic**: the same function runs on the server for SSR and in the browser
on client navigation. Therefore they may import only `*.functions.ts` server functions
(`src/features/<domain>/server/*.functions.ts`) and isomorphic helpers — never
`@menuza/db`, Prisma, `@menuza/orpc-server`, `process.env` secrets or `src/server/**`,
because that module graph is shipped to the client and evaluated there.

Design tokens and dashboard rules: `../../DESIGN.md`.
