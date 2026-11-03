# apps/web/src/server

Server-only modules: request-scoped clients, host resolution and the SEO origin
helpers. Parent doc: `../../AGENTS.md`.

Nothing here may be imported by a route file, a component or a loader. Routes
render in the browser as well, so their module graph is shipped to the client and
evaluated there; `.oxlintrc.json` enforces the boundary with
`no-restricted-imports` on `apps/web/src/routes/**` for `@/server/*`. The
generated clients in `src/lib/api/**` are called from here and from
`*.functions.ts`, never from a route or a component.

## What lives here

- `panel-client.ts` — `panelClient()`, the tenant API client bound to the session
  cookie of the current request (`getRequest()`), plus the `TenantClient` type.
- `server-api.ts` — `storefrontClient()` (tenant resolved by the request
  middleware, forwarded as `x-menuza-tenant-id`) and `getCommerceStatus()`.
- `tenant-resolve.ts` — host → mode/tenant resolution for the request middleware.
- `proxy-upstream.ts` — the dev/prod passthrough for `/commerce`, `/tenant`,
  `/mcp`, OAuth and webhook paths.
- `cache.ts` — request-scoped memoisation helpers.
- `seo/` — `requestOrigin()`, `absoluteUrl(path)` and `isIndexableHost()`; the
  only place the request host is turned into a URL. See `seo/AGENTS.md`.

## How a route reaches this code

Never directly. The route calls a server function
(`src/features/<domain>/server/*.functions.ts`) built with
`createServerFn({ method: "GET" | "POST" })`; that function may import from here
because it never enters the client bundle. Anything a route needs from this
folder — the store name, the public `/mcp` URL, the commerce status — is returned
by such a function.

## Rules

- Never read `process.env` in a route or component; read it here.
- Never build a URL from a constant origin; use `absoluteUrl`/`requestOrigin` so
  every host (tunnel, storefront, main domain) answers with its own origin.
- `panelClient()` returning `null` means "no session", not "no permission": the
  caller maps it to `unauthenticated` and the route redirects to login.
- Server route handlers (`src/routes/**/export.ts`) are the one exception allowed
  to import from here, because they never render in the browser. They are
  exempted explicitly in `.oxlintrc.json`.
