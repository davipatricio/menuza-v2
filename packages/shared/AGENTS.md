# @menuza/shared

- Browser-safe contract package. NO server-only imports, NO env reads, NO database access.
- Two explicit entrypoints: `@menuza/shared/commerce` and `@menuza/shared/tenant`.
- Contracts are defined first; implementations consume them. Changes go contract → server, never the reverse.
- All inputs/outputs validated with Valibot (Standard Schema).
- Tenant management contract exposes the health probe, the push routes
  (`/push/public-key`, `/push/preferences`, `/push/subscriptions`), and the staff
  session + panel routes (`/session/*`, `/panel/stores/{storeSlug}`). No anonymous
  management operations: everything beyond the public probe and the VAPID public key
  requires a tenant + member session.
- The dashboard (staff) surface is `session.login` / `session.logout` /
  `session.current` plus `panel.getStore`. The dashboard never sends a tenant header:
  `panel.getStore` resolves `storeSlug -> tenant` server-side, verifies the caller's
  membership and returns the store + role, so a non-member gets `NOT_FOUND` without
  leaking existence (MEN-225). `session.login` opens a `menuza_tenant_sid` session and
  `session.logout` revokes it and clears the cookie.
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
- Session: `POST /session/login`, `POST /session/logout`, `GET /session/current`.
  Panel: `GET /panel/stores/{storeSlug}` (the store slug is a path segment).
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
