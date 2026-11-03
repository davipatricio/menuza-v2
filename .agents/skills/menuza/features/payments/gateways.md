# Gateways and payment methods

`PRODUCT.md` §10, §28. Tickets: MEN-90 gateway por metodo, MEN-91 Pix 24h, MEN-92 pagamento na entrega, MEN-94 reembolso/retry, MEN-168 webhooks idempotentes, MEN-181 Asaas SaaS, MEN-133..140 secondary gateways, MEN-217/218 webhooks.

## Per-method providers

- Each store configures **different providers per method** (e.g. Pix on A, card on B). Menuza does **not** auto-route between providers of the same method.
- The store owns the account, the contract and the credentials; there is **no central Menuza custody** as a premise. Credentials are encrypted at rest with an env master key and never exposed client-side.
- Methods desired: Pix, credit, debit, meal voucher, food voucher, boleto, cash-on-delivery, card machine on delivery. Installments are store-configurable.
- Pay-on-delivery and card-machine-on-delivery may run without an API and be reconciled manually (`payments/README.md` owner order flows). A failed payment allows **retry or switching method** on the same order. **Refund is total only** in the MVP.

## MVP gateway

- **Asaas** is the MVP order gateway; other providers are a per-store secondary gateway (MEN-90, MEN-133..140).
- SaaS billing on Asaas is a **separate plane** (MEN-181): recurring card, Pix Automático, boleto. Pix support does not prove Pix Automático support.

## Integrity (non-negotiable)

- Repeated confirmations, retries and duplicate gateway webhooks must **not** duplicate charge, write-off, commission or cashback.
- **Never trust the browser return as payment confirmation.** Confirm from the gateway webhook/notification, idempotent by provider key + HMAC signature (MEN-168).
- Webhooks are meant to enter through the commerce API and be drained by the worker; neither end is ported yet (see Code entry points).

## Pix specifics

- Default validity **one day**, shortened when needed to meet the delivery time. Expired Pix stays in history as expired/unpaid and emits an expiry event (MEN-91).
- Expiry is a scheduled job; it must not race the payment confirmation.

## Pay-on-delivery specifics

- The order enters **fulfilment before payment is confirmed**, showing "Pendente — pagamento na entrega".
- An authorized member records receipt; commission and cashback apply on that record (MEN-92).

## Code entry points

- **Per-store configuration** — `PaymentIntegration` + `PaymentMethodAssignment` in the live
  schema (`crates/persistence/migrations/0001_baseline.sql`; `packages/db/prisma/contract.prisma`
  is the historical contract). The panel handlers are
  `crates/api-tenant/src/domains/tenant/subdomains/panel/payments.rs`; the queries are
  `crates/persistence/src/tenant/panel/payments.rs`. The provider secret is AES-256-GCM
  ciphertext keyed by `INTEGRATION_SECRET_KEY` and never returned by any read.
- **One provider per method** — the unique on `(tenantId, method)` is the routing rule; there
  is no fallback between providers of the same method. A method bound to the `offline`
  provider creates the order with no expiry window (the store reconciles it); anything else
  keeps the 24 h window.
- **Pagar.me** — the Rust half is `apply_gateway_event` in
  `crates/persistence/src/commerce/payments.rs`, with the DTOs in
  `crates/contract/src/commerce/payments.rs` (`crates/contract/src/tenant/panel/payments.rs`
  holds the provider enum and panel shapes). It consumes a `GatewayEvent` row that a receiver
  has already persisted, maps the provider event type (`map_pagar_me_event_type`) and applies
  it to the order in one transaction; a replayed event is answered from the row.
- **The receiver is not ported.** The panel mints `webhook_path: /webhooks/pagarme/<token>`
  and `apps/web` proxies `/webhooks/*`, but no Rust route authenticates, records or applies a
  callback: there is no HMAC or Basic-auth verification yet, and `payment_events` has no
  producer. Do not assume the webhook path works end to end.
- **Only `paid` moves an order.** Declines are recorded and leave the order awaiting (retry is
  allowed), and refunds, chargebacks and provider cancellations are recorded and ignored —
  those touch stock and wallet money the store owns through the panel.
- `formatBrl` takes **cents** (ADR-0006); all money columns are `Int` cents.

## Checks

- Duplicate payment confirmation does not duplicate commission, cashback or dispatch. → `../../engineering/checks.md` scenario 5.
- Pay-on-delivery enters fulfilment, allows manual dispatch, and only earns commission/cashback after receipt. → scenario 6.
