# Kits

`PRODUCT.md` §7. Tickets: MEN-82 kits nos dois modos, MEN-83 baixa de componentes, MEN-159 (canceled).

A kit is a bundled composition the buyer configures. Two modes — the third ("a partir") was discarded.

## Modes

1. **Pre-selected** — the store defines the product group and the composition; whether the buyer may substitute, and how far, is open.
2. **Build-your-own** — the store sets the eligible-product list, optionally in subgroups; the store toggles availability. This is what "monte seu kit" means.

No reusable kit **templates** in the MVP.

## Composition rules

- Several active kits per store; fixed and free sizes.
- Minimums/maximums for: number of kits, units per product, total items. Product repetition allowed within the limit.
- **Configuration must never let a composition violate its own minimums.**
- Price: formulas are open; **progressive discount by quantity** is supported.
- Coupon and progressive-discount accumulation is configurable per store/campaign.
- Unavailable items are marked out-of-stock or hidden per config.

## Stock interaction

- **Kits discount the chosen variations of their components** — this supersedes any per-kit stock (MEN-83). A kit is not its own stock bucket; it consumes component stock at sale.

## Code entry points

- Models `Kit`, `KitItem` plus `Product`/`Variation` (`packages/db`, tenant-scoped, `Int` cents). Enum-ish columns are `text` + CHECK over ASCII slugs; `pt-BR` labels only in the UI.
- Commerce procedures own buyer kit configuration; the panel owns kit setup in `catalog/`.

## Checks

- A kit respects its minimums/maximums and discounts exactly its components. → `../../engineering/checks.md` scenario 4.
- The two modes never let an invalid composition be saved.
