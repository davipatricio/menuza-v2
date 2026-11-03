# Wallet and cashback

`PRODUCT.md` §11. Tickets: MEN-95 cashback + creditos, MEN-96 historico e reversoes, MEN-128 extrato, MEN-129 limites.

The wallet holds cashback and store-added credits. It is **per tenant** and every balance change is a recorded movement, never a silent edit.

## Rules

- The wallet receives cashback and store-added credits. **No customer credit purchase** in the MVP.
- Cashback is calculated on the final **net value after freight and discounts**; the exact "after freight" formula is still open.
- Released when the order is marked **paid** (for pay-on-delivery, on receipt). The balance can pay a whole order or combine with another method.
- Manual adjustments require permission and are audited (`../stores-and-teams/audit.md`).
- **Wallet isolation is per tenant** — never share a balance across stores by assumption.
- Balance changes always leave a consistent financial history (ledger-style), so the balance is reconstructible.

## Open (do not invent)

- Cashback percentage and eligibility.
- Credit validity/expiry.
- Whether balance-paid portions earn new cashback.
- Balance reservation during a mixed payment.
- Cashback reversal — including when the credit was already spent.
- Refund destination for wallet or mixed orders.

## Code entry points

- Wallet and movement tables in `crates/persistence/migrations/0001_baseline.sql` (tenant-scoped, `Int` cents); reads on the commerce side (`crates/api-commerce`, `crates/persistence/src/commerce/wallet.rs`), adjustments on the management side (`crates/api-tenant` panel subdomain) with a capability check.
- Mixed-payment and reversal logic runs in the order/payment handlers; async follow-ups belong to `crates/worker` (River/Postgres, ADR-0008), where `payment-events` still has no producer.

## Checks

- A mixed payment loses no balance on failure and cannot spend the same balance twice. → `../../engineering/checks.md` scenario 7.
- Every balance change has a matching movement record and audit entry.
