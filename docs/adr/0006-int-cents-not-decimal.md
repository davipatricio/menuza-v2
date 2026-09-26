# Money as integer cents, not decimal

Monetary amounts are stored and transported as `Int` cents (`priceCents`,
`totalCents`, `Coupon.value`) across the Prisma 8 contract, the oRPC
contracts, and the panel's own formatting. No `Decimal`/`numeric` column and no
floating-point value ever carries an amount.

## Context

The commerce base models (MEN-225) needed a money representation for product
prices, order totals and coupon discounts. Prisma 8's generated types map
`numeric` to a `Decimal`-like wrapper and `Float` to `number`; both bring
representation questions that a BRL amount does not actually have.

## Decision

**Integer cents everywhere.** A column is `Int` and named with a `Cents`
suffix when the value is a currency amount (`priceCents`, `totalCents`).
`Coupon.value` is the one exception: it is cents for a fixed discount and a
whole percent for a percentage one, disambiguated by `discountType`. The API
splits it into `valueCents` / `valuePercent` so no consumer re-interprets the
raw column.

BRL has no subunit in circulation — the centavo was withdrawn decades ago and
the smallest amount any Brazilian price is quoted in is the real. Rounding
happens once, at the UI edge, in `formatBrl`, which is already the single
formatter for displayed money.

## Consequences

- Arithmetic on money is integer arithmetic, so a sum of order totals is exact
  and needs no epsilon comparison.
- `formatBrl(cents)` is the only place a fraction appears. Anything that
  stores money accepts cents, including the seed fixtures.
- A future currency with a real subunit, or a tax regime with sub-cent
  rounding, would need a different representation. That is a migration, not an
  arithmetic bug: the values are already integers and converting them is a
  single migration of column type and scale.
- `StockMode` and `DiscountType` keep the same ASCII-slug discipline as the
  order status: the stored value is stable and language-neutral, the pt-BR
  label lives only in the UI.

## Alternatives rejected

- **`Decimal` / `numeric` columns**: rejected because BRL has no sub-cent to
  represent, and it would put a `Decimal` type in the contract, the generated
  client and every consumer of it for no precision that is ever used.
- **`Float` / `real` columns**: rejected because binary floating point makes
  money sums inexact, and the failure is silent.
- **Minor units as a string**: rejected because the arithmetic would be
  string concatenation at every aggregation.
