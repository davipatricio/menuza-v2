# @menuza/shared

- Browser-safe contract package. NO server-only imports, NO env reads, NO database access.
- Two explicit entrypoints: `@menuza/shared/commerce` and `@menuza/shared/tenant`.
- Contracts are defined first; implementations consume them. Changes go contract → server, never the reverse.
- All inputs/outputs validated with Valibot (Standard Schema).
- Tenant management contract exposes the health probe, the push routes
  (`/push/public-key`, `/push/preferences`, `/push/subscriptions`), and the staff
  session, account, panel and profile routes (`/session/*`, `/account/*`,
  `/panel/*`, `/profile/*`). No anonymous management operations: everything beyond
  the public probe and the VAPID public key requires a tenant + member session.
- The dashboard (staff) surface is `session.login` / `session.logout` /
  `session.current` / `session.register`, the `account` procedures, the `panel`
  reads and writes, and `profile.saveOnboarding`. The dashboard never sends a
  tenant header: every `panel.*` procedure takes `storeSlug` in its input, and the
  server resolves slug → tenant, verifies the caller's membership and returns
  `NOT_FOUND` to a non-member without leaking existence (MEN-225). The
  `account.*` procedures are the exception and are **member-level**: no
  `storeSlug`, because a management account spans stores. The reads are
  `panel.listOrders` / `panel.getOrder`, `panel.listCustomers` /
  `panel.getCustomer`, `panel.listProducts`, `panel.listCategories`,
  `panel.listCoupons`, `panel.listAuditLogs` and `panel.listTeamMembers`; the
  writes are `panel.getStore` and `panel.createStore`. `session.login` opens a
  `menuza_tenant_sid` session, `session.register` creates the `Member` and
  opens the same session, and `session.logout` revokes it and clears the
  cookie.
- `account.*` (MEN-225) is the account page's whole backend:
  `account.listSessions`, `account.changePassword`, `account.revokeSession` and
  `account.revokeOtherSessions`. The session rows are keyed by the SHA-256
  **digest** of the bearer token, so a `sessionId` on the wire is safe to display
  and to send back — it is never a usable credential. `changePassword` revokes
  every session but the caller's.
- The tenant contract's `internal.resolveHost` procedure is service-to-service only:
  it backs the web proxy's storefront host → tenant lookup and is gated by the
  `INTERNAL_API_SECRET` shared token (`@menuza/orpc-server/internal`), never a browser
  session or a public caller.

## OpenAPI routes

Every leaf procedure declares its REST route with `.meta(openapi({ method, path,
operationId, summary, tags }))` from `@orpc/openapi`. The metadata lives on the
contract so the implemented router (`implement()`) and the OpenAPI generator agree
on one source of truth; it is metadata only, never a shape change to the
`.input`/`.output` chains. Conventions:

- Health probes: `GET /health`.
- Push: `GET /push/public-key`; `GET`/`PUT /push/preferences`;
  `POST`/`DELETE /push/subscriptions` (subscriptions are a collection, and the
  push endpoint URL travels in the body, never as a path segment).
- Session: `POST /session/login`, `POST /session/logout`, `GET /session/current`,
  `POST /session/register`. Account: `GET /account/sessions`, `PUT
/account/password`, `DELETE /account/sessions/{sessionId}` and `POST
/account/sessions/revoke-others` (the digest, not a token, is the path
  segment). Panel: `GET /panel/stores/{storeSlug}` (the store slug is
  a path segment), `POST /panel/stores`, plus the store-scoped reads under the store
  slug: `GET /panel/stores/{storeSlug}/orders` and
  `GET /panel/stores/{storeSlug}/orders/{orderCode}` (the order is addressed by its
  human code, not its id), `/customers` and `/customers/{customerId}`, `/products`,
  `/categories`, `/coupons`, `/audit-logs` and `/team`. Profile: `POST
/profile/onboarding`.
- `path` is absolute under each service's OpenAPI prefix (`/openapi`), so it does
  not depend on the router key structure; `operationId` is explicit for stable
  generated documents.

oRPC has no query/mutation decorator: the distinction is semantic. A **mutation**
is a procedure with side effects and a `.input` (the `POST`/`PUT`/`DELETE`
procedures above); everything else is a **query** (the `GET` procedures). The
declared method is what MEN-221's TanStack Query integration will consume.

## Subpath: @menuza/shared/errors

Global catalog of canonical RPC error codes (`sharedErrorCodes`). Apps spread
the **raw catalog object** into their contract: `oc.errors({ ...sharedErrorCodes,
...local })`. Never spread an oRPC builder — `oc.errors()` returns a builder
that does not satisfy `ErrorMap` (spreading it nests a `~orpc` key and breaks
the contract).
Severity classifier `isFourXxCode` flags codes that should not hit Sentry
(4xx) vs codes that should (5xx and unknown).

## Subpath: @menuza/shared/sentry-privacy

LGPD-oriented Sentry helpers shared by the web and API SDKs: `sentryPiiSafeDataCollection`
(conservative `dataCollection`), `scrubSentryEvent`/`scrubSentryBreadcrumb` (beforeSend
filters) and `scrubPiiText` (CPF/CNPJ/e-mail/phone/card redaction). Pure and Sentry-free
so both `@sentry/bun` and `@sentry/nextjs` consumers can import it.

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
