# public — AGENTS.md

The crate root says the storefront surface is anonymous; this is that surface,
and anonymous goes further than it sounds. None of these four reads — `/store`,
`/menu`, `/products/{productId}`, `/sitemap` — takes a `CommerceSession` or
calls `require_capability`. There is no member to gate and no capability to
check, so do not add one.

A request that resolves no tenant is not an error. `get_store` answers empty
strings and an empty SEO block, `list_menu` answers empty department and
uncategorized lists, and the sitemap answers no entries. That is the shape the
storefront renders before a host has a store, and turning it into a 404 would
break the landing page.

`GET /products/{productId}` is the exception in form, not in policy: an
inactive or private product answers `{ "product": null }`, never a 404. Hidden
products are reachable here by design and archived ones still return so the page
can render its pause notice. The caller decides what to render.

A tenant claim that is present but unparsable is different from a missing one:
`tenant_of` returns `TENANT_NOT_RESOLVED`, a 400, and never a silent empty
answer. Keep that distinction.
