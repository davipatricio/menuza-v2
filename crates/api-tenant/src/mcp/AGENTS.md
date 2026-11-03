# mcp — AGENTS.md

The admin MCP endpoint from `apps/tenant/src/mcp/`, one path (`/mcp`) on the
tenant binary. A protocol surface, not a panel resource: `router()` is merged
into the binary's router and `openapi()` does not exist here. Nothing under this
folder may carry `#[utoipa::path]` or derive `utoipa::ToSchema`, so `/mcp` stays
out of `crates/openapi/tenant.json` — the same rule OAuth2 and `/webhooks/*`
follow.

## The gate runs before the transport

`server::mcp` authenticates once, in this order, and only then hands the request
to `StreamableHttpService`. Moving a step later would let an unauthenticated
client reach the protocol handshake, so the order is the contract:

1. **bearer** — `Authorization: Bearer <token>`; anything else is `401`
   `invalid_token` with `WWW-Authenticate: Bearer`;
2. **digest** — `domain::oauth::hash_oauth_token`, looked up by
   `persistence::mcp::oauth_token_find`. Raw tokens are never stored or logged;
3. **revoked / expired** — `revoked_at` set or `expires_at` past is the same
   `401` as an unknown token: the gate must not say which;
4. **grant** — `grant_memberships` joins `TenantMembership` to `Tenant` and
   intersects with the token's `tenantIds`. A token always carries its array, so
   an empty one covers no store, never every store;
5. **`mcp-dashboard` switch** — `mcp_integration_enabled` per store. The token
   proves who the member is; the switch proves the store agreed. No enabled
   store is `403` `integration_disabled`, even for a valid token;
6. **session touch** — `mcp_session_touch`, then `mcp_session_create` on first
   use. The row is keyed by the token digest, so one token maps to one row and
   `McpSession_tokenDigest_key` stays satisfied.

A store with no `StoreIntegration` row has never enabled the integration. A
database that does not answer is `500` `server_error`, never a silent `401`:
failing closed is right, lying about why is not.

## Stateless by construction

One fresh `StreamableHttpService` and `McpHandler` per request,
`NeverSessionManager`, `legacy_session_mode: false`, `json_response: true`,
`with_sse_keep_alive(None)`. No `Mcp-Session-Id` is issued: the bearer token is
the whole session, so there is no server-side session map to leak, expire or
rehydrate. `GET` and `DELETE` reach the same handler; the transport answers or
refuses them.

## Host allowlist

`allowed_hosts` comes from `MCP_ALLOWED_HOSTS` (`Config::mcp_allowed_hosts`),
default `localhost, 127.0.0.1, ::1`. Never call `disable_allowed_hosts()` and
never pass an empty list: rmcp reads that as "any `Host`", which reopens the DNS
rebinding hole the check exists to close; `Host` validation is applied inside
the transport. Behind the web app's rewrite the request host is the public one,
so a deployment names its own hosts in the environment.

## The catalog

Tools live in `tools.rs`, generated from one list: name, title,
description, the capability the caller's role must hold, the input schema and
the domain/persistence call it runs. `list_tools` filters that list by the
grant's roles with the same `can` map the panel enforces, so a `staff` token
never sees a tool the call would refuse; `call_tool` re-checks on the way in.

Tools call domain and persistence functions directly — never the panel handlers
and never the router. A handler resolves a cookie and a `storeSlug` and writes an
HTTP response; an MCP call has already been authenticated, so calling the
handler would mean forging a session to reach it. Reusing the persistence
function keeps the tenant scope (`TenantId` bound in the statement) and the
capability gate in exactly one place.

**A tool never outranks the panel call it mirrors.** Same tenant resolution, same
capability check, same persistence function, and the row→DTO mappers stay
`pub(crate)` in the panel modules so there is one mapping, not two that drift.
When the panel tightens a rule, the tool inherits it; a tool that needed extra
authority would be the bug, not the feature.
