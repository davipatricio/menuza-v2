# Storefronts (per tenant)

`PRODUCT.md` §5. Tickets: MEN-77 PWA, MEN-78 dominios, MEN-79 personalizacao, MEN-104 favoritos, MEN-105 avaliacoes.

The buyer-facing store, served on a tenant host. One shop per tenant, reached by the store's menuza subdomain or its own domain — there is no global directory (ADR-0003, ADR-0005).

## Rules

- Responsive, mobile and desktop; **PWA in the MVP** (install + push). Offline operation was not requested.
- Menuza subdomain **and** own domain. Personalization: logo, colors, banners, fonts, section order, texts, photos, social links, layout — editor extent and per-plan limits still open.
- Institutional pages confirmed: home, product, contact, policies. Cart, checkout and account area are required.
- Product reviews only (not store reviews); showing reviews and nutritional info is store-configurable, subject to applicable duties.
- Default product order set by the store; showing unavailable products configurable; favorites in the MVP.
- Filters planned (by registered data and store context): category, price, calories, protein, dietary restriction, ingredients, weight, availability, fresh/frozen.
- Accessibility is not optional: keyboard navigation, labeled fields, legible contrast, accessible errors and states — regardless of personalization.

## Code entry points

- `apps/web/src/app/(storefront)/` — the storefront route group; today `/store` only (`/menu`, `/cart`, `/checkout` are allowed by the proxy but not yet built).
- Host → mode and tenant resolution: `apps/web/src/proxy.ts` (main vs storefront; injects `x-menuza-tenant-id`), never a direct `Domain` read.
- The storefront reads commerce data through `apps/commerce`; it never touches the database. Route rendering stages: `../engineering/route-stages.md`.
- Theme/offline shell: `ThemeToggle`, `SerwistProvider`, `QueryProvider`, `OfflineListener` in the root layout.

## Checks

- The service worker cache strategy served the route's shell (MEN-220); push permissions are optional (MEN-197).
- Buyer auth is email + password in the MVP (MEN-76); guest checkout is enabled by default (`../payments/README.md` → checkout).

Checkout and cart live in `../payments/README.md`; scheduling and pickup in `../delivery/README.md`.
