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
- Webhooks enter through `apps/commerce` and are drained by `apps/worker`.

## Pix specifics

- Default validity **one day**, shortened when needed to meet the delivery time. Expired Pix stays in history as expired/unpaid and emits an expiry event (MEN-91).
- Expiry is a scheduled job; it must not race the payment confirmation.

## Pay-on-delivery specifics

- The order enters **fulfilment before payment is confirmed**, showing "Pendente — pagamento na entrega".
- An authorized member records receipt; commission and cashback apply on that record (MEN-92).

## Code entry points

- **Per-store configuration** — `PaymentIntegration` + `PaymentMethodAssignment` in
  `packages/db/prisma/contract.prisma`; the panel procedures are
  `packages/api-tenant/src/domains/tenant/subdomains/panel/paymentSupport.ts` and the four
  `*Payment*` impls next to it. The provider secret is AES-256-GCM ciphertext written by
  `@menuza/orpc-server/crypto` and never returned by any read.
- **One provider per method** — the unique on `(tenantId, method)` is the routing rule; there
  is no fallback between providers of the same method. A method bound to the `offline`
  provider creates the order with no expiry window (the store reconciles it); anything else
  keeps the 24 h window.
- **Pagar.me client and callback** —
  `@menuza/pagarme-api-client` (`packages/pagarme-api-client/`) owns the Core API v5
  outbound transport (`pagarMeRequest`), credential parsing, webhook envelope decoding,
  Basic-auth verification, and event → action mapping (re-exported by
  `packages/api-commerce/src/domains/commerce/subdomains/payments/pagarme.ts`). The receiver
  is `receive.ts` (authenticate, record, enqueue) and `applyGatewayEvent.impl.ts` (apply to the
  order). The producer is `apps/commerce/src/payment-webhook.ts` (plain route, own redacted
  log — the token is in the URL); the drain is `apps/worker/src/payment-events.ts`.
- **Only `paid` moves an order.** Declines are recorded and leave the order awaiting (retry is
  allowed), and refunds, chargebacks and provider cancellations are recorded and ignored —
  those touch stock and wallet money the store owns through the panel.
- `formatBrl` takes **cents** (ADR-0006); all money columns are `Int` cents.

## Checks

- Duplicate payment confirmation does not duplicate commission, cashback or dispatch. → `../../engineering/checks.md` scenario 5.
- Pay-on-delivery enters fulfilment, allows manual dispatch, and only earns commission/cashback after receipt. → scenario 6.
