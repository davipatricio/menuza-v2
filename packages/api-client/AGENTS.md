# @menuza/api-client

The one HTTP client for both Rust APIs. Orval generates it from
`crates/openapi/{commerce,tenant}.json`, so the OpenAPI documents stay the only
source of truth (ADR-0002): a contract change lands in `crates/contract`, the
document is regenerated with `cargo run -p openapi`, and this package is
regenerated with `bun run api:generate` from this folder.

## Rules

- `src/commerce.ts`, `src/tenant.ts` and `src/model/**` are generated. Never edit
  them by hand; change the contract and regenerate. `src/http.ts` is the
  hand-written mutator they import.
- URLs come from the generated `get*Url()` builders and are browser-relative
  (`/commerce/...`, `/tenant/...`). Web stays relative; a native client calls
  `configureApi({ origin })` once and every request goes absolute. That native
  origin must be the reverse proxy that strips the mount (the web dev server in
  preview), never the bare Rust port — `:3001` answers `/stores/…`, not
  `/commerce/stores/…`.
- Headers a caller must send on every request (the tenant claim, the tenant
  session cookie) go through `configureApi({ headers })`, never through a
  per-call `RequestInit`. The generated operations accept `RequestInit`, so a
  one-off header would silently skip the rest of the surface.
- The client does not throw on a non-2xx response: it returns
  `{ data, status, headers }`, exactly like the document's response union. The
  caller owns the status check and the error mapping.
- Never import this package from a server module that needs a trusted origin:
  the web server clients (`apps/web/src/server/**`) keep their own absolute
  origin and are the only places allowed to trust `TENANT_INTERNAL_URL` /
  `COMMERCE_INTERNAL_URL`.

## Subpaths

- `@menuza/api-client/commerce` — storefront, orders, wallet, payments.
- `@menuza/api-client/tenant` — sessions, account, panel, profile, push, OAuth.
- `@menuza/api-client/model` — every generated schema; the barrel is large, so
  import a single schema from `@menuza/api-client/model/<schema>` when possible.
- `@menuza/api-client/http` — `configureApi`, `resetApi` and `apiFetch`.

## Regeneration

```bash
bun run api:generate        # from packages/api-client
```

Orval renames four commerce operations (`health`, `listMenu`, `getProduct`,
`listSitemap`, `getStore`); every other operation keeps its `operationId`, which
is the API. Renaming one breaks every caller.
