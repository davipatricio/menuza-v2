# internal — AGENTS.md

One route: `GET /internal/resolve-host`, the host-to-tenant lookup the web proxy
calls before it knows which tenant it is serving. It is the only place in this
crate that answers a question about a tenant nobody has chosen yet.

`InternalToken` is required and cannot be omitted. The handler does not read a
cookie, does not take `TenantScope`, and must not gain either: it is the
enumeration oracle the token exists to close, and a browser-reachable variant
would hand out every tenant id to anyone with a host name.

The match is exact. `tenant_by_host` looks up `host = lower($1)`, so the lookup
is case-folded but not suffixed, trimmed of subdomains or pattern-matched.
Wildcards and a fallback tenant belong in the proxy, not here.

`Domain` is tenant-scoped, and this read is the exception `Scope::unscoped`
exists for. Keep it the only one.

An unknown host is not an error: the body is `{ "tenantId": null }`. Turning
that into a 404 would make the proxy distinguish failure from absence on a
route it calls for every request.

Do not add a second internal route, a bulk lookup, or a tenant-metadata read.
Each new one needs its own justification against the same oracle.
