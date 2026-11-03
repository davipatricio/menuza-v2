# crates/http — AGENTS.md

The only HTTP stack in the workspace. Both binaries mount it and never add a
layer of their own: a layer or extractor copied into `api-commerce` or
`api-tenant` is a bug, because a proxy or a client that talks to both must see
the same behaviour from both.

## Layer order

`layers::apply` assembles the stack outside-in, and the order is a contract
(ADR-0007):

1. **request id** — reuses an inbound `x-request-id`, else mints a UUID, so one
   id spans the whole hop chain. It is outermost because every later layer and
   every log line must be able to quote it;
2. **catch panic** — a panicking handler answers 500 with that id instead of
   dropping the connection;
3. **timeout** — 30 seconds, so a stuck handler frees its connection;
4. **body limit** — 1 MiB, read before the handler ever sees the body;
5. **compression** — only bodies that survived the limit;
6. **trace** — one span per request carrying method, path and status;
7. **access log** — one line per response, `DEBUG` in development and `INFO` in
   production.

`Router::layer` wraps the router it is called on, so the last call is the
outermost layer; the chain in `layers.rs` is written innermost-first. A new
layer goes where its position in that list says, and the list and the `apply`
doc comment move together.

## The seam: `AppState`

`AppState` is the only thing the shared router knows about a binary: `pool()`
and `config()`. That is what lets one `router`/`serve` pair work for both
services. One pool per process, opened by `connect`; nothing here opens a second
one, and no handler gets a connection string.

## Provenance, not identity

`TenantScope` accepts `x-menuza-tenant-id` only when the direct peer address is
loopback, or when `TRUSTED_PROXY_HOPS > 0`, the peer IP is listed in
`TRUSTED_PROXY_HOP_IPS`, and `x-forwarded-host` is present. A forwarded header
alone never grants trust; a browser that reaches the binary directly can never
choose a tenant. A browser
must never choose its own tenant, so a direct request carrying the header is
refused; the TanStack proxy sets the header server-side after resolving the
request host.

`InternalToken` compares `x-menuza-internal-token` against
`INTERNAL_API_SECRET` in constant time and fails closed when the secret is
unset: no secret, no internal caller, never an open door.

## Development surface and logs

`/docs` is mounted only when `MENUZA_ENV=development`; production never serves a
spec route. Logs carry method, path and status, and never a cookie, an
`authorization` header or the database URL — a journal is not a secret store.
