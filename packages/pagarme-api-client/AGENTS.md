# @menuza/pagarme-api-client

- Pagar.me Core API v5 client and webhook adapter.
- Server-side library package. Never import into browser bundles.
- Exports:
  - `PAGARME_BASE_URL`: base API endpoint (`https://api.pagar.me/core/v5`).
  - `pagarMeRequest`: outbound HTTP Basic transport using `sk_…` secret key.
  - `parsePagarMeCredentials`: decodes and validates stored secret key credentials.
  - `parsePagarMeEvent`: parses incoming webhook JSON safely into `PagarMeEvent`.
  - `mapPagarMeEventType`: maps event types to domain actions (`paid`, `payment_failed`, `ignored`).
  - `verifyPagarMeAuthorization`: validates webhook `Authorization: Basic` header against store secret key using constant-time comparison.
- Errors never echo response bodies to prevent leaking sensitive request data or card fragments.
