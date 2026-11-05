# panel — AGENTS.md

The dashboard: sixty-three procedures across seventeen resource modules —
`audit`, `badges`, `categories`, `coupons`, `customers`, `departments`,
`integrations`, `kits`, `orders`, `payments`, `products`, `search`, `seo`,
`stores`, `subcategories`, `tags`, `team`. This module owns no route of its own;
it merges the resource routers and their documents, so a new route lands in
exactly one file.

Every handler starts from `support::context`, which resolves the cookie to a
member and the `storeSlug` path segment to a tenant through that member's
membership. The tenant is never a value the caller chose: a slug that names no
store, or a store the member does not belong to, is `NOT_FOUND` either way.

Writes gate through `support::guard(ctx, capability)` next to the query they
protect. Most reads are session-only — listing products needs a member, not a
capability — while detail and mutation routes check `dashboard:read` or
`catalog:write`. Do not move the gate into a router middleware and do not invent
a capability string here: the catalog lives in `persistence`.

`POST /panel/stores` is the one route that names no store. The caller creates
one and becomes its `owner`, in the same transaction that inserts the tenant, so
a store never exists without a member who can administer it. A resource module
keeps its own `router()` and `openapi()`; anything two resources share goes in
`support.rs`.

Kits write through `catalog:write` like products, but their update is a full
replace: `persistence::tenant::panel::kits::kit_update` deletes the groups,
dishes, allowed swaps and discount bands inside one transaction and re-inserts
them. Never patch a single child row. `kit_create`/`kit_update` mint the group
ids server-side from the client-minted key the payload carries, so a group id in
the response is not the one the editor sent.

`kit_get` verifies that every dish variation belongs to the named product and
the tenant before writing; that check is not the contract's job.
