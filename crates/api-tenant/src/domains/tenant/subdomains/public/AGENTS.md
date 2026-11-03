# public — AGENTS.md

This subdomain owns nothing. `router()` and `openapi()` are empty and are
merged anyway, so the slot exists in `lib.rs` and in the document builder.

`/health` is not here. It lives in `crate::lib` beside `router()`, because it
answers without a tenant, a session or a pool, and it is the one route the
binary already owned.

The module doc one level up is stale: it says the VAPID public key lands here.
It did not. `GET /push/public-key` is mounted by `push`, next to the handlers
that need the same `VapidConfig` field, and it stays there.

Do not add anonymous storefront reads — store, menu, product, sitemap — to fill
this module. Those are `api-commerce`'s public surface; this process serves the
dashboard and the internal hop, and putting a buyer route here would expose it
on a management host.

The only route that could plausibly belong here is a probe with no state, and
that one is already in `lib.rs`. Leave the folder empty.
