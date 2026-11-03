# src/domains — AGENTS.md

The crate root says the binary is "router only". Here that router has structure:
`domains/tenant/` is the domain and `domains/tenant/subdomains/` holds one
module per subdomain — `public`, `session`, `account`, `profile`, `internal`,
`push`, `panel`. Each module owns its routes, its handlers and its slice of the
OpenAPI document, and `subdomains/mod.rs` merges them in that order.
`domains/tenant/support.rs` holds what they share: `ApiError`, `StoreMember`,
`require_member`, `panel_tenant`, `require_capability` and `tenant_of`.

The bulk is `panel`: seventeen resource modules, sixty-three of the document's
seventy-eight operations. The other six subdomains are one to five routes each,
and that imbalance is deliberate — the panel is the product surface, the rest
are the edges around it.

A subdomain calls `persistence` for its queries, `domain` for pure rules and
`contract` for its types. It never calls another subdomain's handler, and it
never reaches into another subdomain's `support` module. `session::support` and
`account::support` both parse the cookie; that duplication is the rule, not an
oversight, because sharing it would make one subdomain depend on another.

There is no SQL in this tree. Handlers validate, gate and call a typed function
in `crates/persistence`; the statement and its transaction live there, and
`Scope` is what keeps a query inside one tenant. Anything two subdomains need
belongs in `tenant/support.rs`; anything only one needs stays in its own.
