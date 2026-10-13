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

- Gateway clients in `packages/api-commerce/src/domains/...`; webhook routes and async jobs in `apps/commerce` / `apps/worker`.
- `formatBrl` takes **cents** (ADR-0006); all money columns are `Int` cents.

## Checks

- Duplicate payment confirmation does not duplicate commission, cashback or dispatch. → `../../engineering/checks.md` scenario 5.
- Pay-on-delivery enters fulfilment, allows manual dispatch, and only earns commission/cashback after receipt. → scenario 6.
