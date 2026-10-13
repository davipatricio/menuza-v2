# Open decisions

`PRODUCT.md` §23, §26–§28. These block detailed design. When a task touches one, surface the gap instead of inventing an answer, and check the ticket before assuming.

## High priority (block detail)

| Decision | Touchpoint |
| --- | --- |
| Commission formula over gross; freight/wallet in base; cancellation-after-payment vs refund | MEN-111, MEN-94 |
| Initial gateways, methods actually supported, SaaS billing | MEN-90, MEN-133..140, MEN-181 |
| Spoke Dispatch access/capabilities; export format; scheduling | MEN-99, MEN-183 |
| Cashback formula, validity, reversals, reward on wallet use, wallet scope | MEN-95, MEN-96, MEN-129 |
| Stock and wallet reservation; expiry and late payment confirmation | MEN-91, MEN-93 |
| Schedule rules and defaults: cut-off, lead time, pickup, manual dispatch | MEN-88, MEN-89 |
| State machine and permissions for payment, cancellation, refund | MEN-93, MEN-94 |
| Birthdate/privacy, advertising, minors, 90-day deletion | MEN-109, MEN-110, MEN-108 |
| Role matrix, owner-only powers, support access | MEN-71..73, MEN-107 |

## Medium priority

Kit price formulas and limits; discount/coupon ordering (MEN-98); notification recipients/defaults (MEN-100); metrics and source events, export fields (MEN-102, MEN-103); plan limits, modules, annual pricing (MEN-112); personalization, reviews, brand identity (MEN-79, MEN-105); food-label info, fiscal docs, operational responsibilities.

## Settled this round (§28) — apply, do not re-open

- Commission base = items subtotal; freight, discounts and wallet use excluded.
- Spoke Dispatch **blocks the MVP**: validate supplier access before integrating; without it, integration moves post-MVP and the MVP falls back to CSV export + manual dispatch.
- MVP order gateway: **Asaas**; other providers as a per-store secondary gateway.
- One delivery base per tenant; multi-base later.
- Schedule default: 2h minimum lead, 14-day horizon, 2h cut before the shift; store-adjustable per shift.
- Guest checkout enabled by default (store can disable); keep minimal logs and separate marketing consent.
- No dedicated pilot; validation is the 12 acceptance scenarios.
- Birthdate is declared required by the founder but LGPD does not oblige it — gate on legal basis before implementing.

Technical pendencies are in `../engineering/followups.md`.
