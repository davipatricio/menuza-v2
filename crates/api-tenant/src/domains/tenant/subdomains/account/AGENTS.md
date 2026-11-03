# account — AGENTS.md

Four member-level routes: `PUT /account/password`, `GET /account/sessions`,
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

Do not add a tenant-scoped route here, and do not accept an arbitrary session id
from a body: the digest, not the token, is the only address this surface knows.
