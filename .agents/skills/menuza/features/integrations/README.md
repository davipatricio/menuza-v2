# Integrations

`PRODUCT.md` §12, §18, §26–§28. Credentials are **per tenant**, encrypted at rest with a master key from the environment, and never exposed in the storefront, exports or logs. Partner webhooks validate HMAC and are idempotent by provider key (MEN-168).

| Integration | Phase | Tickets |
| --- | --- | --- |
| Spoke Dispatch (API + export) | MVP, **gate** | MEN-99 / MEN-183 |
| Asaas — order gateway | MVP | MEN-90, MEN-217 (order webhooks) |
| Asaas — SaaS billing (recurring, Pix Automático, boleto) | MVP | MEN-181, MEN-218 (SaaS webhooks) |
| BrasilAPI (CEP) + Nominatim (geocode) | MVP, provider to confirm | MEN-115, MEN-182, MEN-141 |
| Email transactional (SMTP + `Mailer`, SES later) | MVP, provider open | MEN-101, MEN-147, MEN-174 |
| Storage S3-compatible (R2/B2) + Cloudflare CDN | MVP | MEN-173 |
| Outbound webhooks (per-tenant, signed, dedup id) | backlog | MEN-143, MEN-168 |
| Secondary gateways (Pagar.me, Mercado Pago, PagBank, EFI, AbacatePay, Woovi, Cielo) | backlog | MEN-133..140 |
| Bling (ERP; source of products/stock, order sync direction) | backlog | MEN-142 |
| Lalamove | post-MVP | MEN-148 |
| GA4 / Meta Pixel + CAPI / Google Merchant Center | backlog | MEN-144..146 |

- **Spoke blocks the MVP.** Validate access type (API/SDK), latency, limits, export resources, scheduling support and commercial model before starting the integration; without validation, integrated logistics moves post-MVP and the MVP uses CSV export + manual dispatch (§28).
- Distinguish three billing planes: SaaS subscription (tenant), buyer's one-off payment, and future meal recurrence. Pix support does not prove Pix Automático support.
- AI spreadsheet import (MEN-124..127) is post-MVP. The founder's decision to accept files containing plaintext passwords is **not** a validated-safety decision: require protected transport, restricted access, no training use, minimal retention, and never log credentials. Imported accounts must use invite/new-password, never reuse exposed passwords.
- Marketing pixels and ad integrations need a privacy treatment (`PRODUCT.md` §21); no tracking without a defined legal basis.

## Code entry points

- Commerce-side integrations under `packages/api-commerce/src/domains/...`; management/account integrations on the tenant side; long-running jobs and webhook drains in `apps/worker`.
- The `internal.resolveHost` procedure is the only cross-service host lookup and is token-gated (`@menuza/orpc-server/internal`).

## Checks

- An integration failure is visible and recoverable without duplicating the request. → `../engineering/checks.md` scenario 10.
- No secret in logs, telemetry, previews or AI responses.
