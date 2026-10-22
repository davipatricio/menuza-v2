# Component catalog

What the shadcn registry namespaces in `apps/web/components.json` actually give you, and which
blocks fit each Menuza surface.

This file is an inventory and a routing map. The blocks selected from it are installed as library
code in `apps/web`; none is wired into a route yet. Counts and paths are in [Installed](#installed).
Page-by-page placement and the remaining "use this one, not that one" decisions come in a later pass.

Survey method, comparisons and rejected candidates:
[`docs/research/shadcn-ecosystem.md`](../research/shadcn-ecosystem.md).

## Registered namespaces

Added with `bunx shadcn registry add` on shadcn `4.22.0`. Every namespace below resolves with
`bunx shadcn view @<namespace>/<item>` from `apps/web`.

| Namespace            | URL template                                     | Items | Free tier                                     | Primitive layer            |
| -------------------- | ------------------------------------------------ | ----- | --------------------------------------------- | -------------------------- |
| `@reui`              | `https://reui.io/r/styles/{style}/{name}.json`   | 2012  | 1,264 `c-*` examples + 57 in-house primitives | Base UI, via `base-nova`   |
| `@smoothui`          | `https://smoothui.dev/r/{name}.json`             | 275   | 42 sampled, 0 paywalled                       | Base UI                    |
| `@magicui`           | `https://magicui.design/r/{name}.json`           | 250   | 36 sampled, 0 paywalled                       | none — `motion` + Tailwind |
| `@motion-primitives` | `https://motion-primitives.com/c/{name}.json`    | 33    | 33                                            | none — `motion` only       |
| `@cult-ui`           | `https://www.cult-ui.com/r/{name}.json`          | 307   | 19 sampled, 0 paywalled                       | Base UI                    |
| `@aceternity`        | `https://ui.aceternity.com/registry/{name}.json` | 300   | 121 (mixed per item)                          | none — `motion` + Tailwind |
| `@ecomcn`            | `https://ecomcn.vercel.app/r/{name}.json`        | 31    | 31                                            | stock shadcn locals        |

`@reui` uses the optional `{style}` placeholder, so it resolves through the `"style": "base-nova"`
already set in `components.json` — the same style the rest of `src/components/ui/` uses. The other
ReUI style paths (`base-vega`, `base-mira`, `base-maia`, `base-lyra`) also exist; the non-Base UI
ones (`nova`, `new-york`, `new-york-v4`) return 404.

### The free tier is per item, not per category

Advertising does not match the registry. Two examples that shaped the catalogs below:

- **Aceternity** is free for effects, heroes and 3 navbars; every page section
  (`pricing-with-switch`, `testimonials-marquee-grid`, `logo-cloud-marquee`, `stats-with-number-ticker`,
  `team-section-with-scales`, `cta-with-masonry-images`, `blog-with-search`, `empty-state-with-cards`)
  returns **401**. Treat it as an effects library, not a sections library.
- **Tailark** is not registered at all: every marketing block returns **401**, only `core-*` is free.

Always confirm an item before planning around it:

```bash
bunx shadcn view @reui/c-data-grid-1     # 200 → payload; 401 → paywalled; 404 → wrong name
```

## Operating rules

- **Inspect before installing.** `bunx shadcn view @ns/item` first, then
  `bunx shadcn add @ns/item --dry-run`, then the real add.
- **Keep the vendor folder.** The CLI writes to each item's declared `target`, which is not
  consistent across registries. Pass `--path` so a vendored component lands next to the existing
  files in `components/ui/{aceternity,cult-ui,magicui,motion-primitives}/`:
  `bunx shadcn add @magicui/marquee --path src/components/ui/magicui`.
  ReUI, SmoothUI and ecomcn declare their own targets and land in `components/reui/`,
  `components/smoothui/` and `components/ecomcn/`.
- **Never install a duplicate primitive.** `src/components/ui/` already ships `button`, `card`,
  `input`, `label`, `dialog`, `alert-dialog`, `popover`, `sheet`, `sidebar`, `table`, `tabs`,
  `select`, `combobox`, `checkbox`, `avatar`, `badge`, `breadcrumb`, `calendar`, `field`,
  `input-group`, `collapsible`, `dropdown-menu`, `empty`, `separator`, `skeleton`, `spinner`,
  `textarea`, `toggle`, `toggle-group`, `tooltip`. A registry block that lists one of those in
  `registryDependencies` resolves it against the local file — that is correct, do not re-add it.
- **`c-*` examples install to `components/examples/`.** ReUI's 1,264 examples are demos, not
  library code. Read them with `view` and copy the pattern into the page; do not `add` them en
  masse.
- **No Radix.** `@base-ui/react` is the primitive layer (see `apps/web/AGENTS.md`). Every item
  inspected while building this catalog was scanned for `@radix-ui/*` imports and none were found.
  The one transitive exception is `cmdk` (see Known gaps).

### Where installed files land

| Namespace                                    | Target in the registry item                                    | Installed path                                        |
| -------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `@reui` primitives                           | `components/reui/<name>/…` (e.g. `components/reui/data-grid/`) | `apps/web/src/components/reui/`                       |
| `@reui` hooks                                | `hooks/use-*`                                                  | `apps/web/src/hooks/`                                 |
| `@reui` `c-*`                                | `components/examples/…`                                        | not installed — read with `view`                      |
| `@smoothui`                                  | `components/smoothui/<name>/…` (some ship a `.module.css`)     | `apps/web/src/components/smoothui/`                   |
| `@ecomcn`                                    | `components/ecomcn/<name>.tsx`                                 | `apps/web/src/components/ecomcn/`                     |
| `@ecomcn` `theme-editorial`                  | `registry:theme`                                               | `apps/web/src/app/globals.css`                        |
| `@aceternity`                                | `components/ui/<name>.tsx`                                     | `apps/web/src/components/ui/aceternity/` via `--path` |
| `@magicui`, `@cult-ui`, `@motion-primitives` | no target — falls back to `aliases.ui` (`src/components/ui/`)  | `apps/web/src/components/ui/<vendor>/` via `--path`   |

### Installed

Installed on 2026-10-21. Every file typechecks (`bun check --all`) and lints with zero errors
(`bunx oxlint`); warnings are confined to vendored upstream code. Nothing is imported by a route yet.

| Namespace            | Items | Path                                            | Notes                                                                 |
| -------------------- | ----: | ----------------------------------------------- | --------------------------------------------------------------------- |
| `@ecomcn`            |    31 | `apps/web/src/components/ecomcn/`               | 30 blocks + the `theme-editorial` theme (tokens in `globals.css`)     |
| `@reui`              |    29 | `apps/web/src/components/reui/`                 | 27 components + 2 hooks in `src/hooks/`; 84 files                     |
| `@smoothui`          |    55 | `apps/web/src/components/smoothui/`             | `<name>/index.tsx` blocks; 65 files                                   |
| `@motion-primitives` |    25 | `apps/web/src/components/ui/motion-primitives/` | 26 files — `useClickOutside.ts` is a hook                             |
| `@magicui`           |    31 | `apps/web/src/components/ui/magicui/`           | `file-tree` skipped; the stock `button` that came with it was removed |
| `@aceternity`        |    23 | `apps/web/src/components/ui/aceternity/`        |                                                                       |
| `@cult-ui`           |    38 | `apps/web/src/components/ui/cult-ui/`           | 39 files — `animated-number` came along with the `halo-*` install     |

### Skipped on purpose

| Item                                                                     | Reason                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `@smoothui/command`, ReUI `c-command-*`                                  | `cmdk` depends on `@radix-ui/react-dialog`.                                   |
| `@cult-ui/gradient-heading`                                              | Depends on `@radix-ui/react-slot`.                                            |
| `@cult-ui/onboarding`, `@cult-ui/wizard-expandable`                      | Depend on `@radix-ui/react-use-controllable-state`.                           |
| `@cult-ui/halo-toast`                                                    | Depends on `sonner`.                                                          |
| `@magicui/file-tree`                                                     | Duplicates the SmoothUI headless-tree `file-tree` and uses a Radix accordion. |
| Aceternity page sections, Tailark, shadcnblocks, shadcnstore Epic Blocks | Paywalled (see [Not registered, and why](#not-registered-and-why)).           |

## Dashboard

**Primary source: ReUI free.** It is the only namespace with real table, filter, chart and
app-shell coverage, and it is the only one built directly on TanStack Table v9.

### ReUI free example groups

Counts are registry items; every group listed here was spot-checked (`c-*-1` returns 200).

| Group             | Items | Use                                                  |
| ----------------- | ----: | ---------------------------------------------------- |
| `data-grid`       |    34 | Editable, pinnable, virtualised tables               |
| `stepper`         |    44 | Multi-step flows                                     |
| `chart`           |    25 | Dashboard charts                                     |
| `empty`           |    20 | Empty states                                         |
| `table`           |    17 | Plain tables                                         |
| `pagination`      |    15 | Table and list paging                                |
| `filters`         |    12 | Faceted filter bars                                  |
| `item`            |    12 | List rows                                            |
| `timeline`        |    12 | Activity feeds                                       |
| `dialog`          |    10 | Modal forms                                          |
| `skeleton`        |    10 | Loading states                                       |
| `command`         |     8 | Command palette                                      |
| `kanban`          |     6 | Board view                                           |
| `sidebar`         |     5 | App shell sidebars                                   |
| `navigation-menu` |     4 | Site nav (the only free marketing-adjacent ReUI set) |
| `sheet`           |     4 | Side panels                                          |

### ReUI free in-house primitives

These are the part stock shadcn does not have. All 57 names (including submodules) return 200.

| Area    | Primitives                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data    | `data-grid` (+ 11 submodules: cell selection, column header/filter/visibility, i18n, pagination, scroll area, table, DnD, DnD rows, virtual, table virtual), `filters` (+ 4), `sortable`, `tree`, `cascader` (+ 5), `gantt` (+ 4), `kanban`, `event-calendar` (+ 3), `timeline` |
| Forms   | `stepper`, `date-selector`, `time-picker`, `number-field`, `phone-input`, `rating`, `color-picker`, `emoji-picker`, `signature-pad`, `autocomplete`                                                                                                                             |
| Display | `alert`, `badge`, `code-block`, `file-type`, `frame`, `icon-stack`, `icon-tile`, `scrollspy`                                                                                                                                                                                    |
| Hooks   | `use-copy-to-clipboard`, `use-file-upload`                                                                                                                                                                                                                                      |

### Compatibility notes

- **TanStack Table v9 — verified match.** `@reui/data-grid` imports `tableFeatures`,
  `createSortedRowModel`, `ReactTable`, `TableFeatures` and `sortFn_*`. Menuza runs
  `@tanstack/react-table` 9.3.1, the v9 line. This is why ReUI outranks every v8-era table block.
- **New dependencies for `data-grid`:** `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`, `@tanstack/react-virtual`. Menuza has none of them today.
- **`stepper` primitive is clean.** It depends on `@base-ui/react` only. The 44 `c-stepper-*`
  _examples_ are React Hook Form based; Menuza standardises on `@tanstack/react-form`. Use the
  primitive, write the form yourself.
- **`c-sidebar-1` and `c-dialog-1` pull stock shadcn primitives** (`avatar`, `breadcrumb`, `button`,
  `card`, `dropdown-menu`, `sidebar`, `dialog`, `field`, `input`). Those resolve against the local
  Base UI files, not a vendor copy.

### Secondary dashboard sources

| Source               | Items worth taking                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@smoothui`          | `sidebar`, `drawer`, `dialog`, `skeleton`, `content-skeleton`, `pagination`, `empty`, `file-tree`, `preview-card`, `toast`, `spinner`, `grid-loader`, `motion-loader`, `page-preloader` (`command` skipped — `cmdk`)                                                 |
| `@cult-ui`           | `kanban-board`, `analytics-chart`, `sortable-list` — not installed in this pass; the installed cut is the marketing/background/halo set under `ui/cult-ui/`. `onboarding` and `wizard-expandable` skipped (Radix).                                                   |
| `@magicui`           | `terminal`, `animated-list` (`file-tree` skipped — duplicates SmoothUI)                                                                                                                                                                                              |
| `@aceternity`        | `sidebar`, `timeline`, `code-block`, `terminal`                                                                                                                                                                                                                      |
| `@shadcn` (built-in) | `sidebar-07` (clean), `pagination`, `item`, `empty`, `drawer` (Base UI). `dashboard-01` **resolves** for `base-nova` but drags `zod` — banned in first-party code — plus `recharts@3.8.0`, `@dnd-kit/*` and `sonner`. Take it as a layout reference, not an install. |

`DESIGN.md` stays authoritative for anything that lands under `/dashboard`.

## Landing pages

No single namespace covers marketing end to end. The split that works:

| Surface           | Source                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header / footer   | `@smoothui` `header-1…6`, `footer-1…4`                                                                                                                                                                                                                                                   |
| Hero              | `@aceternity` `hero-parallax`, `parallax-hero-images`, `macbook-scroll`, `layout-grid`, `bento-grid`, `tracing-beam`, `container-scroll-animation`, `sticky-scroll-reveal`                                                                                                               |
| Features / bento  | `@aceternity` `features-section-demo-1`, `bento-grid`, `layout-grid`; `@smoothui` `features-1…3`                                                                                                                                                                                         |
| Pricing           | `@smoothui` `pricing-1…3`                                                                                                                                                                                                                                                                |
| Social proof      | `@smoothui` `testimonials-1…3`, `logo-cloud-1…4`, `stats-1/2`, `team-1/2`                                                                                                                                                                                                                |
| FAQ               | `@smoothui` `faq-1…4`                                                                                                                                                                                                                                                                    |
| CTA               | `@smoothui` `cta-1…3`                                                                                                                                                                                                                                                                    |
| Navbar (animated) | `@aceternity` `resizable-navbar`, `floating-navbar`, `navbar-menu`; `@smoothui` `expandable-navbar`, `floating-navbar`                                                                                                                                                                   |
| Decoration        | `@magicui` `marquee`, `marquee-logos`, `marquee-3d`, `animated-beam`, `border-beam`, `shine-border`, `particles`, `confetti`, `globe`, `dotted-map`, `light-rays`, `retro-grid`, `aurora-text`, `grid-pattern`, `dot-pattern`, `interactive-grid-pattern`, `noise-texture`, `icon-cloud` |
| Text motion       | `@motion-primitives` `text-morph`, `text-roll`, `text-scramble`, `text-shimmer`, `text-shimmer-wave`, `text-effect`, `text-loop`; `@magicui` `text-reveal`, `word-rotate`, `spinning-text`, `morphing-text`, `typing-animation`, `number-ticker`                                         |
| Hover / pointer   | `@motion-primitives` `magnetic`, `tilt`, `spotlight`, `glow-effect`, `border-trail`, `cursor`, `progressive-blur`, `image-comparison`; `@magicui` `shimmer-button`, `pulsating-button`, `ripple-button`, `animated-list`                                                                 |
| Backgrounds       | `@cult-ui` `hero-dithering`, `hero-color-panel`, `bg-*`, `texture-*`, `organic-*`; `@aceternity` `background-beams`, `background-boxes`, `background-gradient`, `meteors`, `wavy-background`                                                                                             |

`@smoothui` is the only free source of complete marketing _sections_. Its blocks ship as
`components/smoothui/<name>/` and some include a CSS module.

Structurally useful `@cult-ui` marketing pieces: `marketing-hero-analytics`,
`marketing-feature-code`, `feature-carousel` (all installed). `gradient-heading` is skipped — Radix
slot.

Brand tokens come from `globals.css` and `DESIGN.md`; registry blocks that hard-code slate/zinc
palettes need their classes remapped to semantic tokens before they ship.

## E-commerce

**`@ecomcn` is the free source.** 31 items, all 200, organised by funnel stage. No Radix; it pulls
stock `sheet` / `button` and its own items through `registryDependencies`.

| Stage    | Items                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse   | `announcement-bar`, `hero-editorial`, `category-rail`, `collection-grid`, `lookbook-strip`                                                                                          |
| Catalog  | `product-card`, `product-grid`, `sort-toolbar`, `empty-results`, `filter-panel`, `filter-sheet`, `load-more`                                                                        |
| Product  | `product-gallery`, `product-quick-view`, `product-details-accordion`, `size-guide-dialog`, `variant-swatches`, `product-buy-box`, `review-summary`, `related-products`, `price-tag` |
| Cart     | `cart-line-item`, `cart-sheet`, `order-summary`                                                                                                                                     |
| Checkout | `checkout-stepper`, `delivery-options`, `address-form`, `payment-selector`, `order-confirmation`, `order-tracking`                                                                  |
| Theme    | `theme-editorial`                                                                                                                                                                   |

What it does not cover: coupons, admin-side order management, freight/shipping quotes, wallet and
cashback. Those are paid elsewhere (ReUI Pro 87 e-commerce blocks, shadcnblocks 108) or get written
against the existing contracts.

Reference only, not registered: `sadmann7/skateshop` for the storefront/admin split (Next 14).
Stackzero Labs UI is stale (last push 2025-09-01).

## Motion, overlays and micro-animation

| Need                              | Source                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Animated shadcn primitives        | `@cult-ui` `animated-*` (34) and `halo-*` (30) — button, badge, card, input, select, switch, tabs, toast, field, progress, segmented, toggle-group, notification, composer, dropzone |
| Morphing trigger → dialog/popover | `@motion-primitives` `morphing-dialog`, `morphing-popover`                                                                                                                           |
| Dock / bottom nav                 | `@magicui` `dock`, `@motion-primitives` `dock`, `@cult-ui` `dock`                                                                                                                    |
| Scroll progress                   | `@motion-primitives` `scroll-progress`, `@magicui` `scroll-progress`                                                                                                                 |
| Panels and lists                  | `@motion-primitives` `transition-panel`, `animated-group`, `in-view`, `accordion`, `disclosure`, `carousel`, `infinite-slider`                                                       |
| Popovers and overlays             | `@smoothui` `dialog`, `drawer`, `preview-card`, `toast`; `@reui` `c-dialog-1…10`, `c-sheet-1…4`; `@aceternity` `animated-modal`                                                      |

**Do not use `@motion-primitives` `dialog` or `morphing-dialog` as a modal shell.** Both are
hand-rolled portals with `aria-modal` but no focus trap. Menuza's `src/components/ui/dialog.tsx`
(Base UI) stays the modal primitive; take the morph animation, not the shell.

## Not registered, and why

| Registry                                                   | Reason                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `@tailark`                                                 | Every marketing block returns 401. Only `core-*` logos are free.          |
| `@shadcnblocks`                                            | Paid; needs an API key.                                                   |
| `@shadcnstore` (Epic Blocks)                               | Free tier is `app-shell-1` and `app-1` only.                              |
| `@uitripled`, ui-layouts, Beste UI, Kibo UI, shadcn/studio | Radix-based; installing their primitives would put Radix next to Base UI. |
| `data-table-filters`                                       | 2,283 stars, MIT, but Radix — needs a manual port, not a registry.        |
| `marmelab/shadcn-admin-kit`                                | npm package, not a registry.                                              |

## Known gaps

1. **`tw-animate-css` is missing.** `dialog`, `alert-dialog`, `tooltip`, `combobox`, `popover`,
   `dropdown-menu` and `select` use `animate-in` / `fade-in-0` / `zoom-in-95` / `slide-in-from-*` /
   `animate-out`, which Tailwind 4.3.3 does not provide and which are not defined anywhere in the
   repo. Those overlay animations are inert today. Fix is `tw-animate-css` plus
   `@import "tw-animate-css";` in `globals.css` — not done in this pass.
2. **Base UI primitives pulled in so far:** `accordion`, `button-group`, `carousel`, `context-menu`,
   `radio-group`, `scroll-area`, `slider`, `switch`. Still absent: `drawer`, `menu`,
   `navigation-menu`, `preview-card`, `meter`, `toolbar`, `input-otp`, `number-field`,
   `autocomplete`, `checkbox-group`, `fieldset`, `direction`, `progress`, `resizable`, `command`,
   `item`, `pagination`, `hover-card`, `aspect-ratio`, `kbd`, `native-select`, `menubar`, `sonner`.
   Registry blocks pull the ones they need.
3. **`cmdk` drags in Radix transitively.** `@smoothui/command` (and ReUI `c-command-*`) depend on
   `cmdk`, which depends on `@radix-ui/react-dialog`. It only enters the tree if a command palette
   is installed.
4. **Aceternity has no public source repo.** Its components exist only as registry JSON — no
   upstream to diff against when updating.

## Verification

Checked 2026-10-21 against the live registries: item counts from each `registry.json`, free/pro by
the HTTP status of the item JSON (200 / 401 / 404), primitive layer by scanning installed item
source for `@radix-ui/*` and `@base-ui/*` imports. Re-check the paywall before planning work around
a block — it moves at the item level, not the registry level.
