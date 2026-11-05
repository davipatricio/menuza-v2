# Kits

`PRODUCT.md` §7. Tickets: MEN-82 kits, MEN-83 baixa de componentes, MEN-159 (canceled: "a partir").

A kit is a bundled composition the buyer configures. One `kind` column picks one of three shapes; the old two-mode split (`preselected` / `build_your_own`) became `fixed` / `fixed_total`, and its `mode` column was dropped in `0004_drop_kit_mode.sql`. No reusable kit **templates** in the MVP.

## Kinds

| `kind`              | What the manager locks                | What the buyer chooses                                              |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `fixed`             | a `quantity` per dish                 | nothing, unless `allowSwap` opens a swap                            |
| `custom_quantities` | `minQty` / `maxQty` / `step` per dish | counts inside those bounds                                          |
| `fixed_total`       | kit `minItems` / `maxItems`           | how to spread the total across the dishes; per-dish bounds optional |

The kit's own `minItems`/`maxItems` bound the total, never replacing per-dish limits. Only `fixed` carries `quantity`; a locked quantity on any other kind is refused.

## Groups

- `KitGroup` is a named section with its own `minItems`/`maxItems`.
- A dish with `groupId = null` falls into the default group, which has no bounds.
- A group with no dish is refused at save, and so is a dish naming a group that does not exist.
- Every group input carries a client-minted `id`; the server remaps to fresh UUIDs on save.

## Price

Resolved on the server, in this order:

1. `pricingMode = fixed` charges `baseCents`; `sum` charges `max(baseCents, Σ chosen variations)` — `baseCents` is a floor.
2. The kit `percentOff` (0–100) applies to that total.
3. `KitDiscountBand` applies last, keyed by how many of **that** kit the order carries; bands are not cumulative and the highest reached band wins.

Client prices are ignored for kit lines. The price is recomputed at payment time; there is no lock between composition and checkout.

## Variations and stock

- Variations are locked to the manager's choice. `allowSwap` per dish opens only the variations listed in `KitItemVariation`.
- A sold-out dish stays visible and blocked. When the composition can no longer reach its own minimums the kit obeys `unavailableBehavior`: `hide` drops it from the storefront, `block` keeps it disabled.
- A kit is not its own stock bucket: selling one discounts the chosen variations of its components (MEN-83).
- `maxKitsPerOrder` is optional.

## Coupons

`CouponKit` scopes a coupon to kits, mirroring `CouponProduct`. `couponStackable` (default on) decides whether a coupon touches a kit line; the coupon scope never bypasses the kit's own price order.

## Editor layout

Three tabs, in this order (`apps/web/src/features/catalog/components/kit-form.tsx`):

1. **Identidade** — nome, slug, foto, descrição, disponível/arquivado, ordem.
2. **Composição & Regras** — kind and the kit's limits first, then groups and dishes.
3. **Preço** — pricing mode, base/floor, percentage, progressive bands, live preview.

Rules that change composition fields (kind, `minItems`/`maxItems`, `maxKitsPerOrder`, `unavailableBehavior`, `couponStackable`) live at the top of the composition tab; there is no separate "Regras" tab. `kit-items-editor.tsx` renders one card per group with that group's dishes and its own `Adicionar prato neste grupo`, plus a `Pratos sem grupo` card; each dish shows its thumbnail, the searchable `product-combobox.tsx` (name and category, availability, `a partir de R$`), the variation select with prices, and only the limit fields its kind uses.

Cross-feature rules for this shape: `apps/web/DESIGN.md` → Composition editors.

## Checks

- A kit cannot be composed past its minimums even when a dish is sold out. → `../../engineering/checks.md` scenario 4.
- The three kinds never save a field they do not use and never drop one they need.
- Panel preview and storefront agree on the price for the same composition and band count.
