# crates/api-commerce — AGENTS.md

The commerce binary: public storefront and buyer-facing operations, on port
`3001`. `src/main.rs` is the boot sequence (`Config`, tracing, pool, docs mount,
`serve`); `src/lib.rs` holds `State`, `router` and `openapi`. The router is the
whole file: layers, health probes and shutdown live in `crates/http`.

## Binding

Development binds loopback, the default `127.0.0.1`. Only the image sets
`HOST=0.0.0.0`, because behind it there is a reverse proxy and nothing else. Do
not make the default public-facing to "fix" a container.

## Who may call what

The storefront surface (menu, product detail, store info) is anonymous: it is
what a buyer sees before any session exists. Orders and wallet are tenant
scoped and require a resolved tenant — never a tenant the caller chose. Tenant
resolution is proved by `TenantScope`, so read the tenant from it and pass the
value down; do not re-read the header.

`/webhooks/*` is a provider surface, not an API the panel or the TanStack client
calls. It stays outside the OpenAPI document and out of the generated client.

## The OpenAPI document is generated

Every route is declared with `#[utoipa::path]` and listed in the `#[openapi]`
attribute of `openapi()`; a route missing from either is invisible to the
client. `operation_id` is camelCase and stable: the TanStack client is generated
from these operation ids, so renaming one is a rename in every caller and a
frontend-breaking change.

Regenerate with `cargo run -p openapi`; never hand-edit
`crates/openapi/commerce.json`.
