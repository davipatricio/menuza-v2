# Delivery, freight, scheduling

`PRODUCT.md` §12–§14. Tickets: MEN-86 frete, MEN-87 cobertura, MEN-88 agenda, MEN-89 retirada, MEN-99 Spoke, MEN-115 CEP/geocode.

## Capabilities (`PRODUCT.md` §12)

Documented by capability, not by final UI names; the options can coexist:

1. **Integrated delivery** — Menuza sends data to a partner via integration; the store's account.
2. **Store-operated delivery** — manual dispatch and export, including to external tools.
3. **Pickup** — buyer collects at the store.

- All eligible options must appear to the buyer. **One delivery base per tenant**; no split deliveries for one order. An unserved address blocks delivery and offers pickup when active. No courier app/portal in the MVP.
- **MVP: Spoke Dispatch via API and export. Later: Lalamove.** Accounts, contracts and credentials are per store; commercial/API access is **not confirmed** — verify formats, endpoints, resources and permissions before promising automation.
- Integrated dispatch is requested **after payment**; a scheduled order keeps its date/shift — paid early does not authorize immediate delivery. Pay-on-delivery uses manual dispatch as the current direction. Choose the lowest price when comparable partners exist (not useful until a second eligible integration exists).

## Coverage and freight (`PRODUCT.md` §13)

- Coverage: CEP ranges, radius from the base, neighborhoods, cities. **Straight-line distance in the MVP**; route distance via self-hosted OSRM later. Address/geocoding provider not chosen.
- Four price models: fixed fee; fee by CEP range; fee by distance range; price per km over the whole distance. Example (not a required table): up to 3 km R$ 8, 3–6 km R$ 12.
- Among valid charge rules the **lowest value wins**; a rule may not expand allowed coverage. Free shipping by minimum value, region or coupon. Cart value and coupons can change the charge. Rules belong to the tenant.
- Open: distance precision/rounding, inclusive range limits, minimum/top fee, partner quote vs dispatch, refund treatment.

## Scheduling and pickup (`PRODUCT.md` §14)

- On-demand and scheduled can both be active; configured per store. Weekdays, shifts per day, holidays and special hours; date blocking and vacation.
- No capacity limit per period in the MVP. Cut-off times configurable per day/shift. **Default: 2h minimum lead, 14-day horizon, 2h cut before the shift; store-adjustable per shift** (§28).
- Open: holiday import source, on-demand lead time, pickup hours/proof, late tolerance, reschedule, absent recipient. **Never publish a delivery promise the checkout cannot validate.**

## Code entry points

- Commerce domain procedures in `packages/api-commerce/src/domains/...`; export jobs and scheduled work in `apps/worker` (BullMQ).
- External calls: Spoke client in the commerce integration layer; address/geocode via BrasilAPI (CEP) + Nominatim.
- Scheduled-order timing is data, not a cron side effect: keep the order's date/shift authoritative.

## Checks

- A scheduled order paid before its date is not delivered immediately. → `../engineering/checks.md` scenario 9.
- An integration failure is visible and recoverable without duplicating the logistics request. → scenario 10.
