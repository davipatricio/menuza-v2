# Integrations

`PRODUCT.md` §12, §18, §26–§28. Credentials are **per tenant**, encrypted at rest with a master key from the environment, and never exposed in the storefront, exports or logs. Partner webhooks validate HMAC and are idempotent by provider key (MEN-168).

| Integration                                                                         | Phase                    | Tickets                          |
| ----------------------------------------------------------------------------------- | ------------------------ | -------------------------------- |
| Spoke Dispatch (API + export)                                                       | MVP, **gate**            | MEN-99 / MEN-183                 |
| Asaas — order gateway                                                               | MVP                      | MEN-90, MEN-217 (order webhooks) |
| Asaas — SaaS billing (recurring, Pix Automático, boleto)                            | MVP                      | MEN-181, MEN-218 (SaaS webhooks) |
| BrasilAPI (CEP) + Nominatim (geocode)                                               | MVP, provider to confirm | MEN-115, MEN-182, MEN-141        |
| Email transactional (SMTP + `Mailer`, SES later)                                    | MVP, provider open       | MEN-101, MEN-147, MEN-174        |
| Storage S3-compatible (R2/B2) + Cloudflare CDN                                      | MVP                      | MEN-173                          |
| Outbound webhooks (per-tenant, signed, dedup id)                                    | backlog                  | MEN-143, MEN-168                 |
| Secondary gateways (Pagar.me, Mercado Pago, PagBank, EFI, AbacatePay, Woovi, Cielo) | backlog                  | MEN-133..140                     |
| Bling (ERP; source of products/stock, order sync direction)                         | backlog                  | MEN-142                          |
| Lalamove                                                                            | post-MVP                 | MEN-148                          |
| GA4 / Meta Pixel + CAPI / Google Merchant Center                                    | backlog                  | MEN-144..146                     |

- **Spoke blocks the MVP.** Validate access type (API/SDK), latency, limits, export resources, scheduling support and commercial model before starting the integration; without validation, integrated logistics moves post-MVP and the MVP uses CSV export + manual dispatch (§28).
- Distinguish three billing planes: SaaS subscription (tenant), buyer's one-off payment, and future meal recurrence. Pix support does not prove Pix Automático support.
- AI spreadsheet import (MEN-124..127) is post-MVP. The founder's decision to accept files containing plaintext passwords is **not** a validated-safety decision: require protected transport, restricted access, no training use, minimal retention, and never log credentials. Imported accounts must use invite/new-password, never reuse exposed passwords.
- Marketing pixels and ad integrations need a privacy treatment (`PRODUCT.md` §21); no tracking without a defined legal basis.

## The Integrações tab (MEN-282)

The dashboard's `/dashboard/[storeSlug]/integrations` is the **surface** every one of those
integrations plugs into, and it ships ahead of them: the catalog is complete, only MCP is
wired.

- **The catalog is code, not a table.** `INTEGRATIONS` in
  `packages/shared/src/panel/integrations.ts` lists the entries, their section (`scripts`,
  `connections`, `payments`), copy, author, logo, typed settings (`switch` | `text`) and
  capabilities (`connect`, `sessions`, `sync`, `logs`). Adding Lalamove or Merchant Center
  is one entry plus whatever server module implements it — the list page, the cards and the
  detail page change nothing.
- **Per-store state is a row, not the definition.** `StoreIntegration` holds `status`
  (`enabled` | `disabled` | `paused` | `error`), an opaque `config` JSON string and
  `enabledAt`. A store with no row has never touched the integration: it reads as
  `disabled` with the catalog's own defaults, never as an error. `parseConfig` validates the
  blob against a `string | boolean` record, so a key an older catalog wrote is dropped
  rather than crashing the page.
- **`mock: true` is honest.** Every integration except `mcp-dashboard` says so on its detail
  page instead of pretending its switch has an effect. Logos are inline Simple Icons paths
  with each brand's own hex; Spoke and Pagar.me have no mark and fall back to a monogram.
- Gated on `catalog:write`: a switch changes what runs against the store, which is
  configuration, not a read.

### MCP sessions

- A connected MCP client is a **grant**, not a browser session: `McpSession` (unique
  `tokenDigest`) is the handle the panel lists and revokes, and `oauthTokenId` points at the
  `OAuthToken` that actually authenticates. Several members — and one member on several
  machines — hold sessions at once, so the list is a list, not a slot.
- The row is created lazily by `touchSession` on the first MCP call, keyed by the token
  digest: one token is one row no matter how many tools it calls.
- `POST /mcp` answers 403 `integration_disabled` when the store has not switched the
  integration on, even for a valid token. The token proves **who**; the switch proves the
  store **agreed**.
- **Turning the switch off does not revoke sessions.** Revocation is explicit, from the
  sessions list, so moving an interruptor cannot silently break a colleague's connected
  client.
- Invalidation: a password change and "sign out everywhere" both call
  `revokeMemberMcpSessions`, which revokes the `McpSession` rows and their `OAuthToken`s in
  one transaction. Losing a store membership needs no extra code — every MCP call re-reads
  the member's memberships, so the token loses reach the same instant.
- Two settings: "Habilitar para o painel administrativo" (`allowDashboard`) and "Habilitar
  para clientes na loja" (`allowStorefront`). The second is recorded only; the storefront MCP
  does not exist yet.
- The connect block copies `claude mcp add --transport http menuza <url>`, the Codex
  equivalent and the raw URL, with links to the Claude Code MCP quickstart and OpenAI's
  remote-MCP page. The default OAuth client (`menuza-dashboard`, name "Menuza") is seeded by
  `packages/db/prisma/seed.ts`.

## Code entry points

- Commerce-side integrations under `packages/api-commerce/src/domains/...`; management/account integrations on the tenant side; long-running jobs and webhook drains in `apps/worker`.
- The `internal.resolveHost` procedure is the only cross-service host lookup and is token-gated (`@menuza/orpc-server/internal`).
- Catalog and per-store state: `packages/shared/src/panel/integrations.ts`,
  `packages/api-tenant/.../panel/{list,save}Integration*`, `.../panel/{list,revoke}McpSession*`.
- MCP server: `apps/tenant/src/mcp/{server,tools}.ts`, reached through the web rewrite at
  `/mcp`; OAuth in `apps/tenant/src/oauth.ts` + `apps/orpc-server/src/auth/oauth.ts`.

## Checks

- An integration failure is visible and recoverable without duplicating the request. → `../engineering/checks.md` scenario 10.
- No secret in logs, telemetry, previews or AI responses.
- A new catalog entry must render on the list and detail pages without touching either — if
  it does not, the catalog abstraction has leaked.
