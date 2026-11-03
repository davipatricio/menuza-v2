# crates/api-tenant — AGENTS.md

The management binary on port `3002`: the panel, sessions, accounts, profiles,
push subscription and preferences, and internal host resolution. `src/main.rs`
is the boot sequence (`Config`, tracing, pool, docs mount, `serve`);
`src/lib.rs` holds `State`, `router` and `openapi`. Layers, probes and shutdown
stay in `crates/http`.

## Protocol surfaces

OAuth2 and `/mcp` also live in this process, but they are protocols, not REST
endpoints the panel calls: neither appears in the OpenAPI document and neither
gets an operation id. A route under `/webhooks/*` is the same kind of surface —
outside the document, outside the generated client.

## Tenant scope

Panel routes get the tenant from the session. Internal server-to-server routes
get it from `TenantScope`, which accepts `x-menuza-tenant-id` only from a trusted
hop. A tenant value the client chose for itself is never an input: if the
handler received a tenant id, one of those two paths produced it.

## Binding and docs

Development binds loopback; only the image sets `HOST=0.0.0.0`. `/docs` is
mounted in development only (`MENUZA_ENV=development`) and is not a production
surface — do not add a spec route to reach it remotely.

## Capability gates

A capability check runs in the handler, next to the query it protects, and
returns the catalogued error. The router stays a routing table: a middleware
that guesses at capabilities from a path is rejected in review, because the same
prefix serves stores of different plans.

## OAuth2

`src/oauth/` owns `GET /.well-known/oauth-authorization-server` and the four
`/oauth/*` routes: `token`, `client-check`, `authorize` and `revoke`. `router()`
merges the module; `openapi()` does not, so the protocol never gains an
operation id and never enters `crates/openapi/tenant.json`. The endpoint map,
the `publicOrigin` rule and the digest compatibility with Bun-era clients are
in `src/oauth/AGENTS.md`.

`POST /oauth/authorize` is the only one that needs a session: it reuses the
tenant cookie through `domains::tenant::support::require_member`, so grant
revocation, absolute expiry and the idle window are the panel's, not a second
implementation. The other four authenticate by the token they revoke or by the
client they name. The authorization and token tables carry `tenantIds` arrays
and are not tenant-scoped: a code or token spans the stores it was granted.

## MCP

`src/mcp/` owns the single `/mcp` path, mounted by `router()` and absent from
`openapi()` for the same reason OAuth2 is. It is stateless Streamable HTTP:
one handler per request, no `Mcp-Session-Id`, JSON answers for JSON posts, and a
`NeverSessionManager` — the bearer token is the whole session. The gate runs
before the transport sees the request, in a fixed order: bearer → digest →
revoked/expired → grant → the store's `mcp-dashboard` switch → session touch.
The token proves who the member is, the switch proves the store agreed, and a
valid token on a store that never enabled the integration is `403`, not a tool
catalogue. `MCP_ALLOWED_HOSTS` (`Config::mcp_allowed_hosts`) is the `Host`
allowlist and defaults to loopback; it is never disabled and never empty.

Tools call domain and persistence functions, never the panel handlers and never
the router, and a tool never outranks the panel call it mirrors: same tenant
resolution, same capability check, same persistence function, same
`pub(crate)` row→DTO mapper. The catalog, the gate and the allowlist rules live
in `src/mcp/AGENTS.md`.

## The OpenAPI document is generated

Every typed route is declared with `#[utoipa::path]` and listed in the
`#[openapi]` attribute of `openapi()`, with a camelCase, stable `operation_id`.
The TanStack client is generated from those ids, so renaming one breaks every
caller. Regenerate with `cargo run -p openapi`; never hand-edit
`crates/openapi/tenant.json`.
