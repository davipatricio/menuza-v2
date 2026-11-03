# src/domains — AGENTS.md

The crate root says the binary is "router only". Here that router has structure:
`commerce/` is the domain and `commerce/subdomains/` holds one module per
subdomain — `orders`, `payments`, `public`, `wallet`. Each module owns its
routes, its handlers and its slice of the OpenAPI document, and no subdomain
imports another. `commerce/support.rs` holds what they share: the session
lookup, the capability matrix and the error envelope.

`health` is not a subdomain. It lives in `crate::lib` beside `router()`, because
it answers without a tenant, a session or a pool, and it is the one route the
binary already owned.

Every handler in this tree takes `State`, then `TenantScope`, and — when the
endpoint is authenticated — `CommerceSession`. That order is the signature the
shared extractors expect. `payments` and `orders::expire` take `InternalToken`
instead of `CommerceSession`; `public` takes no credential at all. Read the
tenant from `TenantScope` and pass it down; never re-read the header yourself.

There is no SQL here. Handlers validate, gate, and call a typed function in
`crates/persistence`; the query and its transaction live there.

One thing the crate root gets wrong by omission: `/webhooks/*` is not mounted
here. Only `/payments/gateway-events/{id}/apply` is, and that is an internal
route the worker calls after the webhook receiver has persisted the event.
