# Product meaning

`PRODUCT.md` §1–§2. Menuza is the platform each lojista operates its own ecommerce on. It is not a food retailer and not a marketplace: there is no global buyer-facing store listing. Initial focus is fresh and frozen healthy-marmita stores in greater São Paulo (a starting region, not a permanent restriction); similar lines (healthy restaurants, pet food, hortifruti) fit later.

- **Consumers** are a store's own buyers. The **lojista** is the contracting customer, and the one who pays.
- Consumer positioning, purchase frequency and commercial strategy vary per store and are never imposed globally by Menuza.
- **Goals**: simplify sales, logistics and marketing; raise reorder and margin; cut order errors and manual work; let stores customize storefront and commercial rules; choose payment providers per method; give each team the right access.
- **Deciders** are the owner and the manager; expected tech familiarity is intermediate.
- **References**: competitor Octofood; stores Naturallis, Mawi Foods, Da Mamãe Fitness, Liv Up. References do not authorize copying features or visual identity.

## Business model

Billed per tenant/restaurant.

| Plan | Monthly | Commission |
| --- | --- | --- |
| Starter | R$ 400 | 0.80% |
| Pro | R$ 800 | 0.40% |
| Max | R$ 1,600 | 0.10% |

- Commission is due when the order is **paid** — not when delivery completes. Pay-on-delivery earns it once the store records receipt.
- Base is the **items subtotal**: freight, discounts and wallet use are excluded.
- Pending and cancelled orders earn no commission. A refund does **not** reverse commission; a full refund is a manual-review case (still open).
- 14-day free trial; monthly and annual plans (annual pricing open). Additional modules are planned and unpriced.
- Commission base and plan differentiation (users, monthly orders, modules) are §23 items — confirm before building pricing.
- SaaS billing runs on **Asaas** (recurring card, Pix Automático, boleto), commission via split where supported, else manual transfer (§28).

## Delinquency

A delinquent tenant is deactivated, deleted after 90 days. Before implementing deletion, define notices, export, in-flight orders, legal retention and backup disposal. Deactivation is **not** authority to stop serving orders already accepted.

Tickets: MEN-111 (commission), MEN-112 (plans), MEN-110 (delinquency), MEN-216 (admin).
