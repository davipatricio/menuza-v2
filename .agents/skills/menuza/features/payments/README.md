# Checkout, payments, wallet

`PRODUCT.md` §9–§11. Tickets: MEN-84 carrinho/checkout, MEN-85 cobertura+frete, MEN-90..94 pagamentos, MEN-95/96 carteira, MEN-168 webhooks idempotentes, MEN-181 Asaas SaaS, MEN-217/218 webhooks Asaas.

## Checkout (`PRODUCT.md` §9)

- Account required by default; the store can enable **guest checkout** (default on) keeping the contact data needed to communicate.
- Availability checked at checkout. Cart never mixes tenants; an order is not split across deliveries.
- Order-for-someone-else allowed, with its own recipient and contact. Minimum order configurable by value, delivery mode, region and period.
- Store may enable general note, delivery note and warnings. No automatic abandonment recovery in the MVP. Repeat-order allowed, revalidating price, stock and availability.
- Data: name, phone, email, fiscal document; address for delivery; complement and reference optional; CPF/CNPJ per person type (checkout requirement vs gateway requirements to reconcile). Birthdate is gate-blocked by LGPD (`../../product/open-decisions.md`).
- Confirmation shows items/variations, kit composition, discounts, freight, wallet use, total, payment method, recipient and chosen delivery/pickup **before** confirming.

## Payments (`PRODUCT.md` §10)

- Each store configures **different providers per method** (e.g. Pix on A, card on B) — not automatic routing between providers of the same method. Store owns the account, contract and credentials. No central Menuza custody as a premise.
- Methods desired: Pix, credit, debit, meal voucher, food voucher, boleto, cash-on-delivery, card machine on delivery.
- Installments store-configurable; own/on-delivery payments may run without an API and be manually reconciled. A failure allows retry or switching method on the same order. **Refund is total only** in the MVP.
- **Integrity**: repeated confirmations, retries and duplicate gateway webhooks must not duplicate charge, write-off, commission or cashback. **Never trust the browser return as payment confirmation.** Idempotency by provider key + HMAC signature (MEN-168).
- **Pix**: default validity one day, shortened when needed to meet the delivery time; expired stays in history as expired/unpaid and emits an expiry event.
- **Pay-on-delivery**: the order enters fulfilment before payment is confirmed, shows "Pendente — pagamento na entrega", an authorized member records receipt, and commission/cashback apply on that record.

## Wallet and cashback (`PRODUCT.md` §11)

- The wallet receives cashback and store-added credits; no customer credit purchase in the MVP.
- Cashback is calculated on the final net value **after freight and discounts**; "after freight" still needs an unambiguous formula.
- Released when the order is marked paid; the balance can pay a whole order or combine with another method; manual adjustments require permission and audit.
- Open: cashback %, eligibility, credit validity, whether balance-paid portions earn new cashback, balance reservation during mixed payment, cashback reversal — including when the credit was already spent — and refund destination for wallet/mixed orders.
- **Wallet isolation is per tenant**; never share a balance across stores by assumption. Balance changes are never silent edits — they keep a consistent financial history.

## Code entry points

- Models `Order`, `Coupon`, `Customer`, `AuditLog` in `packages/db` (tenant-scoped, `Int` cents).
- Commerce procedures in `packages/api-commerce/src/domains/...`; gateway webhooks enter through `apps/commerce` and are drained by `apps/worker`.
- Money helpers: `formatBrl` takes cents (ADR-0006).

## Checks

- Duplicate payment confirmation does not duplicate commission, cashback or dispatch. → `../engineering/checks.md` scenario 5.
- Pay-on-delivery enters fulfilment, allows manual dispatch, and only earns commission/cashback after receipt is recorded. → scenario 6.
- Mixed payment loses no balance on failure and cannot spend the same balance twice. → scenario 7.
- Checkout computes coverage, cheapest valid freight rule, discounts and time reproducibly. → scenario 8.
