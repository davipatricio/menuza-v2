# Scheduling, pickup and dispatch

`PRODUCT.md` §12, §14. Tickets: MEN-88 agenda, MEN-89 retirada, MEN-99 Spoke, MEN-183 Spoke access.

## Scheduling

- On-demand and scheduled can both be active, configured per store.
- Weekdays, shifts per day, holidays and special hours; date blocking and vacation.
- No capacity limit per period in the MVP.
- Cut-off times configurable per day/shift. **Default: 2h minimum lead, 14-day horizon, 2h cut before the shift; store-adjustable per shift** (`../../product/open-decisions.md`).
- Open: holiday import source, on-demand lead time, late tolerance, reschedule, absent recipient.
- **Never publish a delivery promise the checkout cannot validate.**

## Pickup

- Pickup is one of the three delivery capabilities; the buyer collects at the store.
- Buyer auth not required (guest default); pickup hours and proof are open.

## Dispatch

- Integrated dispatch is requested **after payment**; a scheduled order keeps its date/shift — **paid early does not authorize immediate delivery**.
- Pay-on-delivery uses **manual dispatch** as the current direction.
- Among comparable partners, choose the **lowest price** (not useful until a second eligible integration exists).
- The logistics request is **idempotent**: a retry or duplicate webhook never issues it twice.

## Code entry points

- Commerce domain procedures for scheduling eligibility and pickup; dispatch client and jobs in the commerce integration layer / `apps/worker`.
- Scheduled-order timing is **data**, not a cron side effect: the order's date/shift is authoritative.
- Spoke specifics: `../integrations/README.md`.

## Checks

- A scheduled order paid before its date is not delivered immediately. → `../../engineering/checks.md` scenario 9.
- An integration failure is visible and recoverable without duplicating the logistics request. → scenario 10.
