# session — AGENTS.md

Four routes: `POST /session/login`, `POST /session/register`, `GET
/session/current`, `POST /session/logout`. The credential is the
`menuza_tenant_sid` cookie, and this subdomain is the only place in the crate
that writes a `Set-Cookie` header — `support::json_with_cookie` is that single
insertion point, and login, register and logout all go through it.

The cookie value is the raw token; the row key is its SHA-256 digest. The digest
never leaves `persistence` — no response body, no log line, no error message
carries it. `open_session` hashes once and hands back both halves, and logout
hashes the cookie to find the row.

Login answers the same `UNAUTHORIZED` for an unknown e-mail and a wrong
password, and a null `passwordHash` fails closed. Registration writes the member
and its first session in one transaction, and a duplicate e-mail is the generic
`CONFLICT` — the endpoint must not confirm which addresses exist. `current`
re-reads the member after validating the cookie, so a deleted row is a 401 and
not a half-filled payload. Logout is idempotent and always clears the cookie.

There is no tenant on this surface: no `storeSlug`, no `TenantScope`, no
membership check. That binding happens in `panel` and `push`.

Do not add a route that returns a session token in a body, and do not add a
fifth route here — password and revocation changes belong to `account`.
