# #0008 Sentry env documented as NEXT_PUBLIC_SENTRY_* but code reads VITE_SENTRY_*

- 2026-11-17T22:09:21Z `issue`: Sentry env documented as NEXT_PUBLIC_SENTRY_* but code reads VITE_SENTRY_* [apps/web/src/sentry.client.ts:16]
- 2026-11-17T22:09:21Z `issue`: isTrustedProxy uses client-controlled first x-forwarded-for entry; tenant spoof [apps/web/src/server/tenant-resolve.ts:220]
- 2026-11-17T23:19:37Z `fix`: Track 2 auth/OAuth/HTTP hardening: production-by-default MENUZA_ENV, IP-bound RateLimiter on login/register/change_password/oauth_token, dummy Argon2id timing equalizer, same-origin on login/logout/oauth_authorize, trusted-peer gate on OAuth discovery, strict PKCE S256 + required redirect_uri, direct OAuthToken/OAuthAuthCode revocation on password change [crates/http/src/rate_limit.rs]
