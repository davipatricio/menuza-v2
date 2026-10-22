# shadcn ecosystem: blocks, components and pluggable Tailwind libraries

Survey of the pluggable, copy-paste UI ecosystems built on shadcn/ui, for dashboards,
landing pages, heroes, sections, admin UIs and storefronts.

**Verified on:** 2026-10-21.
**Method:** GitHub REST API (`/repos`, `/search/repositories`) for stars, license and
`pushed_at`; each registry's own `registry.json` for item counts, category breakdown and
the primitive layer it targets. Sources are linked per row.

> Maintenance is judged by `pushed_at` (last push to `main`), not by release tags.
> Anything not pushed in 2026 is flagged as stale.

## Key context: Base UI is now the default

shadcn/ui made **Base UI the default** for new projects in July 2026 (Radix is still
supported), and every official block — including `dashboard-01`, `sidebar-*`, `login-*`
and `signup-*` — now ships in both Radix and Base UI variants.

This matters for adoption: a registry built on Radix primitives is **not** a drop-in
for a Base UI project. Each row below records which primitive layer it targets.

Sources:
[Base UI as the default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default) ·
[Blocks for Radix and Base UI](https://ui.shadcn.com/docs/changelog/2026-02-blocks) ·
[Base UI documentation](https://ui.shadcn.com/docs/changelog/2026-01-base-ui)

## Discovery layer

| Resource                                                                  | What it is                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [registry.directory](https://registry.directory/)                         | The explorer for the shadcn registry ecosystem — **104 public registries**, with `directory.json` and a cross-registry `items.json`. Every submission is audited (registry + items must resolve with installable content). |
| [shadcn.io/awesome/registries](https://www.shadcn.io/awesome/registries)  | Curated list of **30** registries.                                                                                                                                                                                         |
| [bytefer/awesome-shadcn-ui](https://github.com/bytefer/awesome-shadcn-ui) | 739 ★, pushed 2026-09-14 — broader curated list (templates, themes, admin patterns).                                                                                                                                       |
| [shadcn/ui MCP server](https://www.shadcn.io/mcp)                         | Lets an agent search the registry ecosystem instead of guessing.                                                                                                                                                           |

## Foundation

| Project                                         | Stars   | Last push  | Notes                                                                                                |
| ----------------------------------------------- | ------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 126,149 | 2026-10-20 | The base. Blocks: `dashboard-01`, `sidebar-03/07`, `login-03/04`, `signup-01`, charts. Free forever. |

## Landing pages, heroes, sections (block registries)

Sorted by breadth of catalog. Item counts are from each registry's own `registry.json`.

| Registry                                            | Stars | Last push  | Items                                                    | Category hits                                                                                                                                                  | Primitive                       | License    |
| --------------------------------------------------- | ----- | ---------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| [shadcnblocks.com](https://shadcnblocks.com/)       | 406   | 2025-10-09 | **4,675**                                                | 609 feature/bento · 298 hero · 159 blog · 108 ecommerce · 96 pricing · 87 stats · 54 footer · 51 auth · 48 data-table · 40 testimonial · 31 faq · 31 dashboard | Radix                           | Free + Pro |
| [Beste UI](https://ui.beste.co/)                    | 37    | 2026-10-15 | **2,398** blocks                                         | 253 feature · 237 hero · 157 stats · 92 faq · 89 navbar · 81 pricing · 50 footer · 40 testimonial · 17 ecommerce · 14 dashboard                                | Radix                           | Pro        |
| [ReUI](https://reui.io/)                            | 3,772 | 2026-10-16 | **2,012** (1,926 blocks)                                 | 77 chart · 56 ecommerce · 38 stats · 24 hero · 17 cta · 14 filters · 12 sidebar                                                                                | **Base UI**                     | MIT + Pro  |
| [Shadcn Space](https://shadcnspace.com/)            | 785   | 2026-10-21 | **1,061** (521 blocks / 511 components / 29 pages)       | 57 hero · 41 animation · 37 feature · 36 ecommerce · 20 pricing · 20 chart · 18 testimonial · 14 data-table · 12 dashboard                                     | Radix (no Base UI dep declared) | Free       |
| [shadcn/studio](https://shadcnstudio.com/)          | 1,957 | 2026-08-20 | **694** (608 components / 57 blocks / 22 base / 7 pages) | 10 dashboard · 3 hero · 1 ecommerce                                                                                                                            | Radix                           | Free + Pro |
| [Tailark](https://tailark.com/)                     | 2,334 | 2026-07-29 | **476** (264 blocks / 131 components / 79 ui)            | 57 feature · 40 hero · 23 auth · 16 team · 14 bento · 10 stats · 8 navbar                                                                                      | **Base UI + Radix**             | **Paid**¹  |
| [SmoothUI](https://smoothui.dev/)                   | 1,018 | 2026-10-16 | **275** (229 ui / 35 blocks / 7 theme)                   | 6 header · 4 footer · 3 cta · 4 faq · 3 features · 4 logo-cloud · 3 pricing · 2 stats · 2 team · 3 testimonial                                                 | **Base UI + Radix**             | Free       |
| [ui-layouts](https://ui-layouts.com/)               | 3,808 | 2026-08-23 | **327** (253 components / 74 blocks)                     | 52 animation · 11 hero · 11 feature · 9 team · 7 faq · 7 testimonial                                                                                           | Radix                           | Free       |
| [Epic Blocks](https://shadcnstore.com/)             | 1,211 | 2026-10-09 | **292**                                                  | 43 ecommerce · 27 hero · 26 feature · 13 cta · 13 storefront · 12 chart · 11 stats · 10 testimonial · 7 data-table                                             | Radix                           | Free       |
| [UI TripleD](https://ui.tripled.work/)              | 1,361 | 2026-08-28 | **282** (165 components / 74 blocks / 23 pages)          | 63 native · 22 glassmorphism · 16 animated · 6 cta · 6 feature · 4 hero · 4 faq · 4 stats                                                                      | Radix                           | Free       |
| [blocks](https://github.com/ephraimduncan/blocks)   | 1,851 | 2026-10-07 | —                                                        | React + Tailwind + shadcn/ui block library                                                                                                                     | Radix                           | MIT        |
| [launch-ui](https://github.com/launch-ui/launch-ui) | 869   | 2026-09-04 | —                                                        | Landing-page kit, copy/paste                                                                                                                                   | Radix                           | MIT        |
| [page-ui](https://github.com/PageAI-Pro/page-ui)    | 1,692 | 2026-07-06 | —                                                        | Landing-page components on Tailwind                                                                                                                            | Radix                           | MIT        |

**Largest single storefront/catalog coverage:** shadcnblocks.com (108 ecommerce-named
blocks) and ReUI (56 ecommerce blocks; the site advertises 87 including sub-variants).

¹ **Tailark's blocks are paywalled.** Every `hero-section-*`, `secondary-hero-*`,
`footer-*`, `header-*`, `bento-*`, `features-*`, `expandable-features-*`,
`call-to-action-*`, `pricing-*`, `testimonials-*` and `faqs-*` item returns HTTP 401.
Only the `core-*` family (logos, utilities) and a few shadcn-ish primitives
(`accordion`, `avatar`, `button`, `card`, `chart`, `dialog`, `navigation-menu`,
`scroll-area`, `select`, `toggle`, `tooltip`, `gantt`, …) are free.

## Free tier, verified per item (HTTP status of the item JSON)

Registries advertise catalog size; the paywall hides at the item level. Probing each
item JSON returns **200 = free**, **401 = paywalled**, **404 = does not exist**.

| Registry                                            | Free                                                                                                                                                                                                                                                                                                                           | Paywalled                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [ReUI](https://reui.io/)                            | 1,264 `c-*` examples + 27 in-house primitives                                                                                                                                                                                                                                                                                  | 748 unprefixed full-page blocks (`card-*`, `solution-*`, `app-*`, `data-*`, `stats-*`, `product-*`) |
| [SmoothUI](https://smoothui.dev/)                   | landing blocks, nav, dialog, drawer, skeleton, command, popover, toast — all 200                                                                                                                                                                                                                                               | the `theme-*` family                                                                                |
| [Aceternity](https://ui.aceternity.com/)            | 121 of 300 — effects, heroes and three navbars (`resizable-navbar`, `floating-navbar`, `navbar-menu`, `hero-parallax`, `bento-grid`, `layout-grid`, `macbook-scroll`, `tracing-beam`, `animated-modal`, `timeline`); its page sections are Pro                                                                                 | the rest                                                                                            |
| [Magic UI](https://magicui.design/)                 | 250 items (`marquee`, `dock`, `number-ticker`, `blur-fade`, `shine-border`, `border-beam`, `scroll-progress`, `morphing-text`, `particles`, `confetti`, `bento-grid`, `globe`, `text-reveal`, `shimmer-button`, `pulsating-button`, `ripple-button`, `word-rotate`, `spinning-text`, `animated-list`, `file-tree`, `terminal`) | —                                                                                                   |
| [Motion Primitives](https://motion-primitives.com/) | all 33 items — **only dependency is `motion`**                                                                                                                                                                                                                                                                                 | —                                                                                                   |
| [Cult UI](https://cult-ui.com/)                     | ~300 of 307 (`animated-*` and `halo-*` families are animated shadcn primitives)                                                                                                                                                                                                                                                | a handful                                                                                           |
| [Epic Blocks](https://shadcnstore.com/)             | `app-shell-1`, `app-1` only                                                                                                                                                                                                                                                                                                    | `app-shell-2..5`, `app-2..9`                                                                        |
| [Tailark](https://tailark.com/)                     | `core-*` only                                                                                                                                                                                                                                                                                                                  | every marketing block                                                                               |

## Animation / effects (the "hero" differentiator)

| Registry                                                     | Stars  | Last push  | Notes                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [React Bits](https://github.com/DavidHDev/react-bits)        | 49,918 | 2026-10-19 | Largest animated-component library. Not shadcn-CLI-first, but registry-compatible.                                                                                                             |
| [Magic UI](https://magicui.design/)                          | 22,778 | 2026-10-17 | 250 items. The de-facto standard for animated shadcn primitives (marquee, blur-fade, animated beam, number ticker).                                                                            |
| [Motion Primitives](https://motion-primitives.com/)          | 6,779  | 2026-09-28 | Motion-based; the cleanest source of scroll/spring primitives.                                                                                                                                 |
| [Cult UI](https://cult-ui.com/)                              | 6,658  | 2026-10-14 | 307 items (154 ui + 153 component). **Base UI + Radix.**                                                                                                                                       |
| [Canvas UI](https://github.com/DavidHDev/canvas-ui)          | 5,047  | 2026-10-03 | WebGL-over-HTML canvas components.                                                                                                                                                             |
| [Animate UI](https://animate-ui.com/)                        | 4,563  | 2026-10-19 | 790 items, Motion-based.                                                                                                                                                                       |
| [Kokonut UI](https://kokonutui.com/)                         | 2,190  | 2026-10-21 | Tailwind + shadcn/ui + Motion.                                                                                                                                                                 |
| [SmoothUI](https://smoothui.dev/)                            | 1,018  | 2026-10-16 | 275 items. **Base UI + Radix.**                                                                                                                                                                |
| [Aceternity UI](https://ui.aceternity.com/)                  | —      | —          | 200+ animated components + blocks. **No public source repo** (the GitHub org holds only two boilerplates, one archived) — components are copy-paste from the site; a mirror lives on 21st.dev. |
| [Creative Tim UI](https://github.com/creativetimofficial/ui) | 12,082 | 2026-03-14 | Components, blocks and AI agents for Tailwind/shadcn.                                                                                                                                          |

## Component primitives (non-blocks)

| Registry                                         | Stars | Last push  | Notes                                                                   |
| ------------------------------------------------ | ----- | ---------- | ----------------------------------------------------------------------- |
| [Basecoat](https://github.com/hunvreus/basecoat) | 4,383 | 2026-07-21 | Tailwind-only (no shadcn CLI). Multi-stack.                             |
| [Kibo UI](https://kibo-ui.com/)                  | 3,968 | 2026-05-04 | 41 items. Accessible, extensible — but Radix-only.                      |
| [Franken UI](https://github.com/franken-ui/ui)   | 2,608 | 2026-06-14 | HTML-first, UIkit 3 + LitElement. Not React-native.                     |
| [Dice UI](https://www.diceui.com/)               | 2,096 | 2026-10-21 | Accessible primitives — angle slider, avatar group, direction provider. |
| [Intent UI](https://intentui.com/)               | 1,976 | 2026-10-20 | Built on **React Aria Components**, not Radix/Base UI.                  |
| [Seraui](https://github.com/seraui/seraui)       | 1,341 | 2026-02-18 | Tailwind component library.                                             |

## Admin / dashboard

| Project                                                                                             | Stars  | Last push  | Stack           | Notes                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)                                   | 15,842 | 2026-09-10 | Vite + React    | The most-starred shadcn admin. RTL-aware component tweaks.                                                       |
| [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | 7,153  | 2026-10-20 | Next 16 + TS    | "AI-friendly" starter: charts, tables, forms, auth.                                                              |
| [arhamkhnz/next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard)   | 3,190  | 2026-10-21 | Next 16         | Multiple dashboards + auth layouts + theme presets.                                                              |
| [marmelab/shadcn-admin-kit](https://marmelab.com/shadcn-admin-kit/)                                 | 1,132  | 2026-10-21 | React           | Blocks that handle loading / empty / error states — the part templates usually skip.                             |
| [shadcndashboard/shadcndashboard](https://shadcndashboard.dev/)                                     | 503    | 2026-10-01 | React + Vite    | Complete admin kit.                                                                                              |
| [Tailwind Admin (free)](https://tailwind-admin.com/)                                                | 286    | 2026-05-26 | React           | Free tier of a commercial admin.                                                                                 |
| [data-table-filters](https://data-table.openstatus.dev/)                                            | 2,283  | 2026-10-02 | React           | Faceted filters, sorting, infinite scroll and a row sheet for shadcn tables — one table schema drives all of it. |
| [shadboard](https://github.com/Qualiora/shadboard)                                                  | 730    | 2025-12-13 | Next 15         | Stale but readable.                                                                                              |
| [horizon-ui/shadcn-nextjs-boilerplate](https://github.com/horizon-ui/shadcn-nextjs-boilerplate)     | 650    | 2025-01-28 | Next            | **Stale** (Jan 2025).                                                                                            |
| [refine](https://refine.dev/)                                                                       | 35,926 | 2026-09-10 | React framework | Admin/internal-tool framework, not a copy-paste kit.                                                             |

## Storefront / e-commerce

| Project                                                         | Stars  | Last push  | Notes                                                                                                                                                            |
| --------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [skateshop](https://github.com/sadmann7/skateshop)              | 5,400  | —          | MIT. Next 14 + Clerk + Drizzle + Stripe. README says _"not ready for production use"_. Best reference for a storefront + admin split; **Next 14 and Radix-era**. |
| [relivator](https://github.com/reliverse/relivator)             | 1,565  | 2025-10-04 | Next 15 + React 19 + better-auth + Drizzle + Polar. Last push Oct 2025.                                                                                          |
| [stackzero-labs/ui](https://github.com/stackzero-labs/ui)       | 265    | 2025-09-01 | Component collection for commerce apps (React, Next, Tailwind, shadcn).                                                                                          |
| [nimara-ecommerce](https://github.com/mirumee/nimara-ecommerce) | 131    | 2026-10-21 | Headless, composable storefront on Next + shadcn. Actively maintained.                                                                                           |
| [ecomcn](https://ecomcn.vercel.app/)                            | 5      | 2026-10-19 | E-commerce blocks organised by purchase funnel: filters, buy box, cart sheet, checkout that never touches card data.                                             |
| [Commercn](https://github.com/Logging-Studio/Commercn)          | 81     | 2026-08-07 | shadcn e-commerce blocks.                                                                                                                                        |
| [vercel/commerce](https://github.com/vercel/commerce)           | 14,314 | 2026-10-19 | **Archived** — do not start from it.                                                                                                                             |
| [medusajs/ui](https://github.com/medusajs/ui)                   | 118    | 2023-11-14 | **Archived** (2023).                                                                                                                                             |

## AI / agent surfaces (adjacent, popular)

| Project                                             | Stars                       | Last push      | Notes                                                         |
| --------------------------------------------------- | --------------------------- | -------------- | ------------------------------------------------------------- |
| [prompt-kit](https://github.com/ibelick/prompt-kit) | 3,127                       | 2026-09-28     | Core building blocks for AI apps.                             |
| [AI Elements](https://ai-sdk.dev/elements/overview) | 2,496                       | 2026-10-14     | Vercel's registry on top of shadcn/ui.                        |
| [ElevenLabs UI](https://ui.elevenlabs.io/)          | 2,427                       | 2026-10-16     | Orbs, waveforms, voice agents, audio players.                 |
| [21st.dev](https://21st.dev/)                       | 5,510 (`serafimcloud/21st`) | **2025-05-28** | Marketplace + CLI. The _repo_ is stale; the _service_ is not. |
| [magic-mcp](https://github.com/21st-dev/magic-mcp)  | 6,177                       | 2026-09-09     | MCP server over 10,000+ React/Tailwind components.            |

## Commercial marketplaces (not open source)

| Product                                       | Scope                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Tailwind Plus](https://tailwindcss.com/plus) | The official paid marketplace from the Tailwind/shadcn team — templates, blocks, Figma kits. |
| [shadcnblocks.com](https://shadcnblocks.com/) | ~2,478 premium blocks + ~2,154 components + 21 templates; free tier included.                |
| [shadcn.io](https://www.shadcn.io/)           | Template marketplace (incl. an e-commerce category) + curated awesome lists.                 |
| [allshadcn.com](https://allshadcn.com/)       | Templates and tools directory.                                                               |
| [21st.dev](https://21st.dev/)                 | Marketplace + AI agent.                                                                      |

## Stale or archived — avoid as a starting point

- `vercel/commerce` (14,314 ★) — archived.
- `medusajs/ui` (118 ★) — archived since 2023.
- `leoMirandaa/shadcn-landing-page` (1,981 ★) — last push 2024-10-09.
- `nobruf/shadcn-landing-page` (1,293 ★) — last push 2025-01-16.
- `salimi-my/shadcn-ui-sidebar` (1,798 ★) — last push 2025-04-04.
- `horizon-ui/shadcn-nextjs-boilerplate` (650 ★) — last push 2025-01-28.
- `Qualiora/shadboard` (730 ★) — last push 2025-12-13.
- `tommyjepsen/twblocks` (780 ★) — last push 2025-12-15.
- `shadcnblocks/shadcn-ui-blocks` (406 ★) — last push 2025-10-09 (the _site_ ships far more).
- `BelkacemYerfa/shadcn-extension` (1,330 ★) — last push 2025-08-04.
- `slowfound/next-prisma-tailwind-ecommerce` (387 ★) — last push 2025-01-01.
- `bradtraversy/prostore` (333 ★) — last push 2025-08-22.

## Menuza fit

Menuza's web app runs `@base-ui/react` 1.9.0, `motion` 14.3.0, Tailwind 4.3.3, React 19.3.1,
Next 16.4.2, `lucide-react`, `nuqs`, and `@tanstack/react-table` 9.3.1. The
`components.json` already registers `@aceternity`.

**Drop-in (Base UI or no primitive layer):** ReUI (via `@reui` → `reui.io/r/styles/{style}/{name}.json`),
SmoothUI, Cult UI, shadcn/ui's own blocks, Magic UI / Motion Primitives / Aceternity
(Motion-based, no primitive dependency).

**Needs porting from Radix:** shadcnblocks.com, Shadcn Space, shadcn/studio, Beste UI,
Epic Blocks, Kibo UI, ui-layouts, UI TripleD, `data-table-filters`.

**Motion naming:** `motion` (v14) is the current package name; Beste UI and Epic Blocks
declare `framer-motion`. Same API — rename the dependency rather than port the code.

### ReUI style routing

ReUI serves one registry per shadcn style. Verified item URLs:

| Path                                                       | Result                 |
| ---------------------------------------------------------- | ---------------------- |
| `reui.io/r/styles/base-nova/{name}.json`                   | 200 — no Radix imports |
| `reui.io/r/styles/base-{vega,mira,maia,lyra}/{name}.json`  | 200                    |
| `reui.io/r/styles/{nova,new-york,new-york-v4}/{name}.json` | 404                    |

`components.json` supports a `{style}` placeholder, so `"@reui": "https://reui.io/r/styles/{style}/{name}.json"`
resolves to the Base UI variant when `style` is `base-nova`.

### Finding: the overlay animations in `apps/web/src/components/ui/` are inert

`dialog.tsx`, `alert-dialog.tsx`, `tooltip.tsx`, `combobox.tsx`, `popover.tsx`,
`dropdown-menu.tsx` and `select.tsx` all use the `animate-in` / `fade-in-0` /
`zoom-in-95` / `slide-in-from-*` / `animate-out` / `fade-out-0` / `zoom-out-95` utility
family. Those come from **`tw-animate-css`**, which is:

- not in `apps/web/package.json` or the root catalog,
- not present in the bun install cache,
- not provided by Tailwind 4.3.3 (grepped the package: no `animate-in`, no
  `--tw-enter-opacity`),
- not defined as a `@utility` in `apps/web/src/app/globals.css` (the only CSS file —
  its only `@import` is `tailwindcss`).

So every overlay currently opens and closes with no transition. Installing
`tw-animate-css` and adding `@import "tw-animate-css";` to `globals.css` is what makes
those classes resolve.

### Finding: View Transitions are already wired

`globals.css` (lines ~161-206) already carries the harness: `::view-transition {
pointer-events: none }`, a `.store-enter` crossfade (`vt-fade` / `vt-slide-up`), and a
`prefers-reduced-motion` guard. React 19.3 ships `<ViewTransition>` and Next 16.4's
App Router activates it with **no configuration** — route navigations are transitions.
`<Link transitionTypes={['nav-forward' | 'nav-back']}>` adds directional slides.

### Finding: nested dialogs need a Viewport

Base UI's Dialog supports nesting natively (`data-nested`, `data-nested-dialog-open`,
`--nested-dialogs`, child backdrops suppressed). `apps/web/src/components/ui/dialog.tsx`
mirrors shadcn's canonical `base-nova` dialog — which also omits `Dialog.Viewport`.
Adding a Viewport wrapper is what surfaces the nesting hooks, and the `z-50` overlay +
`z-50` popup need a per-layer z-index policy for a dialog opened from inside a Sheet.

### Finding: primitives missing from `src/components/ui/`

Base UI ships these and they are not installed: `Menu`, `Drawer`, `Preview Card`,
`Navigation Menu`, `Meter`, `Toolbar`, `OTP Field`, `Number Field`, `Autocomplete`,
`Checkbox Group`, `Fieldset`, `Direction Provider`. `ReUI`'s `c-*` examples pull the
missing ones in automatically via `registryDependencies`, as does SmoothUI's
`command` / `drawer` / `file-tree` / `preview-card` set.

### Where the gaps are in this repo:

- Marketing pages (`/`, `/about`, `/pricing`, `/contact`) — **SmoothUI** for header /
  footer / cta / faq / features / logo-cloud / pricing / stats / team / testimonials
  (all free, Base UI + Radix), **Aceternity** for the hero (`hero-parallax`,
  `macbook-scroll`, `bento-grid`, `layout-grid`, `tracing-beam`) — already registered.
- Animated navbar — **Aceternity `resizable-navbar` / `floating-navbar` /
  `navbar-menu`** (already registered, free), SmoothUI `expandable-navbar` /
  `floating-navbar`, Magic UI `dock`, Motion Primitives `dock`.
- Storefront (`/store`, `/menu`, `/cart`, `/checkout`) — the e-commerce block sets are
  thin: Epic Blocks (43, mostly paid), ReUI (56, paid), shadcnblocks (108, paid),
  `ecomcn` (free, purchase-funnel blocks). skateshop is the best _reference_ for a
  storefront + admin split but is Next 14.
- Dashboard — ReUI free `c-data-grid-*` / `c-filters-*` / `c-empty-*` / `c-chart-*`,
  `marmelab/shadcn-admin-kit` (loading/empty/error states), `data-table-filters`
  (faceted table, needs a Radix port); the official `dashboard-01` block is a better
  base than any of the full templates.
- Micro-animations — `motion/react` (already installed) for interruptible/spring work,
  native CSS for hover/expand, and **`<ViewTransition>` for anything that crosses a
  route**.
