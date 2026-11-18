# account — AGENTS.md

Five member-level routes: `DELETE /account`,
`PUT /account/password`, `GET /account/sessions`,
`POST /account/sessions/revoke-others`, `DELETE /account/sessions/{sessionId}`.
No `storeSlug` and no tenant scope reach these handlers; the cookie identifies
the member and nothing else.

The path segment is the 64-hex SHA-256 digest that `GET /account/sessions`
returned. It is never re-hashed: `StoreMember.session_id` is already the row
digest, and `RevokeSessionInput::validate` only checks the hex shape. Hashing it
again would silently revoke nothing.

Password change is a revocation, not just a write. It verifies the current
hash, refuses to "change" to the same password (`changed: false`), then revokes
every other session of the member and every connected MCP grant, because the
caller's own row survives so the form does not log them out. A member with no
hash adopts one; a missing hash is not an error.

Revocation is filtered by member id, so another member's digest matches no row
and the answer is `{ revoked: 0 }` — nothing leaks. Revoking the caller's own
row is allowed and is a logout.

Deletion is immediate and irreversible, and its body must repeat the member's
own e-mail address, compared case-insensitively against the authenticated
member. The confirmation exists so a stolen cookie cannot erase an account it
cannot name. The deletion transaction deletes the member, its onboarding row,
its memberships and its bearer tokens. `McpSession`, `OAuthToken` and
`OAuthAuthCode` carry `"memberId"` with **no foreign key**, so a cascade never
reaches them: a deleted member with a live `OAuthToken` would leave a working
MCP bearer token behind, which is why they are deleted here and not revoked.

A tenant whose last `owner` leaves is archived (`Tenant."archivedAt"`), never
deleted: its `Order` rows are the buyer's receipt and the store's history. An
archived tenant resolves for nothing — no storefront host, no panel slug, no
entry in the store picker — but its slug stays taken, so a new store never
inherits the old store's order URLs. A store with a second owner is untouched.

Do not add a tenant-scoped route here, and do not accept an arbitrary session id
from a body: the digest, not the token, is the only address this surface knows.
