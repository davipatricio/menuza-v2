# Coverage and freight

`PRODUCT.md` §13. Tickets: MEN-86 frete, MEN-87 cobertura, MEN-115 CEP/geocode, MEN-141 (post-MVP).

## Coverage

- Defined by CEP ranges, radius from the base, neighborhoods, cities. **One delivery base per tenant** in the MVP.
- Distance is **straight-line** in the MVP; route distance via self-hosted **OSRM** is post-MVP (MEN-149).
- The address/geocoding provider is not chosen — validate before wiring (MEN-115, MEN-141; BrasilAPI for CEP, Nominatim for geocode as the working direction).
- Open: distance precision/rounding, inclusive range limits.

## The four charge models

1. Fixed fee.
2. Fee by CEP range.
3. Fee by distance range.
4. Price per km over the whole distance.

Example (not a required table): up to 3 km R$ 8, 3–6 km R$ 12.

## Selection rule

- Among valid charge rules, the **lowest value wins**.
- A rule may **not** expand the allowed coverage — coverage and pricing are separate decisions.
- Free shipping by minimum value, region or coupon. Cart value and coupons can change the charge.
- Rules belong to the tenant; the buyer never sets a freight value.
- Open: minimum/top fee, partner quote vs dispatch, refund treatment of freight.

## Code entry points

- Commerce domain procedures compute coverage and charge; the checkout flow (`../payments/README.md`) renders the result.
- Straight-line distance from the tenant's base coordinates; CEP→coords via BrasilAPI, coords via Nominatim.

## Checks

- Checkout computes coverage, the cheapest valid freight rule, discounts and time reproducibly. → `../../engineering/checks.md` scenario 8.
- No published delivery promise that checkout cannot validate (`scheduling-and-pickup.md`).
