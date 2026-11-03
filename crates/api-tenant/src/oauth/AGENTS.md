# oauth — AGENTS.md

The five OAuth2 endpoints from `apps/tenant/src/oauth.ts`, plus the discovery
document they advertise. This is a protocol surface, not a panel resource:
`router()` is merged into the binary's router and `openapi()` does not exist
here. Nothing under this folder may derive `utoipa::ToSchema` or carry
`#[utoipa::path]`, because the protocol must stay out of
`crates/openapi/tenant.json` — the same rule `/mcp` and `/webhooks/*` follow.

## Endpoint → handler → persistence

| Endpoint                                      | Handler                      | Queries                                                           |
| --------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `GET /.well-known/oauth-authorization-server` | `metadata::metadata`         | none                                                              |
| `POST /oauth/token`                           | `token::token`               | `oauth_code_find`, `oauth_code_consume`, `oauth_token_insert`     |
| `GET /oauth/client-check`                     | `client_check::client_check` | `oauth_client_find`                                               |
| `POST /oauth/authorize`                       | `authorize::authorize`       | `memberships_by_member`, `oauth_client_find`, `oauth_code_insert` |
| `POST /oauth/revoke`                          | `revoke::revoke`             | `oauth_token_revoke`                                              |

`OPTIONS` answers 204 with the CORS set on metadata, token and revoke; the TS
dispatcher did the same. `token` and `revoke` accept JSON or
`application/x-www-form-urlencoded` (`support::parse_body`); `authorize` accepts
JSON only. A body that does not parse is a client error, never a 500.

Session reuse: `authorize` reads the `menuza_tenant_sid` cookie and resolves it
with `domains::tenant::support::require_member` — the same revocation, absolute
expiry and 24-hour idle window every panel route uses. There is no second
session parser here.

## `publicOrigin`

`domain::oauth::public_origin` is the only place the advertised origin is built.
Behind the web app's rewrite this process sees `http://127.0.0.1:3002`, which
would make discovery useless, so the public host arrives in `x-forwarded-host`.
That header is trusted **only when `TRUSTED_PROXY_HOPS > 0`** — the same switch
`proxy.ts` used — and the forwarded proto falls back to `https`, never to
`http`. Without trusted hops the request's own `Host` is used and a forwarded
header is ignored, so a direct caller cannot forge its way into the document.
The issuer and all three endpoint URLs are derived from that one origin.

## Digest compatibility

`domain::oauth::hash_oauth_token` is the lowercase-hex SHA-256 the Bun backend
called `hashSessionToken`, and it is the key of every OAuth row:
`OAuthAuthCode.codeHash`, `OAuthToken.accessTokenHash`,
`OAuthToken.refreshTokenHash`. Codes and tokens minted before the cutover keep
matching rows written here, and a token minted here keeps matching rows read by
a client that only stores the raw value. Raw secrets are never stored, logged
or returned by a read path.

## What must not be "improved"

- **The scope list.** `admin` is the whole grant; what a token may do inside a
  store is decided per call by the member's role and `TENANT_CAPABILITIES`, not
  by a scope string. Adding finer scopes would create a claim the server does
  not enforce.
- **The TTLs.** Authorization codes live 10 minutes and access tokens 30 days,
  the values the TS constants pinned.
- **The refusal messages.** Every `OAuthError` variant is the exact
  `error_description` string the TS handler sent; clients display them.
- **PKCE.** `S256` only, and any other `code_challenge_method` fails closed.
- **The validation order.** Client id, then redirect URI, then expiry, then
  verifier, and only then the delete. A wrong verifier must not burn the code;
  the delete's row count is the compare-and-swap that makes it single-use.
- **No redirect on a failed authorize.** An unknown client or a URI it never
  registered answers a plain 400. Redirecting there would be the open redirect
  the check exists to prevent.
- **Redirect URI matching is byte for byte** (RFC 6749 §3.1.2.3). No
  normalization, no prefix match, no default port folding.
- **The CORS and cache headers.** `Access-Control-Allow-Origin: *` on metadata,
  token and revoke, `no-store` on token and revoke, `public, max-age=3600` on
  discovery, `Pragma: no-cache` on a successful token. `client-check` and
  `authorize` add none.
