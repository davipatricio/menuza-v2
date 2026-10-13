# Theming, PWA, hosting

`PRODUCT.md` §5, §27. Tickets: MEN-77 vitrine + PWA, MEN-78 dominios, MEN-79 personalizacao, MEN-197 web-push, MEN-220 Serwist.

The storefront is one Next app served on many hosts, themed per tenant. Keep rendering cheap (see `../../engineering/route-stages.md`) and the shell installable.

## Hosting and hosts

- Each tenant gets a Menuza subdomain and may attach its own domain (MEN-78).
- `apps/web/src/proxy.ts` maps host → mode (main vs storefront) and injects `x-menuza-tenant-id`; a storefront host with no known domain is rejected there, not in the page.
- `apps/web` never reads `Domain` directly; host → tenant comes from `internal.resolveHost`, token-gated (ADR-0003/0005).

## Theming

- Store personalizes logo, colors, banners, fonts, section order, texts, photos, social links and layout. Editor extent and per-plan limits are open (`../../product/open-decisions.md`).
- Theme is data, applied as tokens; never let personalization break accessibility (contrast, focus, labels, error states).
- The storefront shell is cached; per-visitor detail (cart, session) stays out of the shared cache.

## PWA

- Install + push are in the MVP; offline operation was **not** requested (MEN-77).
- Service worker compiled by Serwist, served at `/serwist/sw.js`; manifest at `/manifest.webmanifest`; `SerwistProvider` in the root layout. Cache strategy per route is MEN-220.
- Push requires device/browser permission and is never the only record of an operational event (`../notifications/README.md`, MEN-197).
- VAPID keys are env-only; the public key is the sole anonymous tenant route (`packages/api-tenant/AGENTS.md`).

## Code entry points

- `ThemeToggle`, `SerwistProvider`, `QueryProvider`, `OfflineListener` in the root layout; storefront pages under `apps/web/src/app/(storefront)/`.
- `apps/web/src/proxy.ts` for host/tenant routing.

## Checks

- A storefront route keeps the shell stage set in `../../engineering/route-stages.md`.
- Themable tokens meet contrast; keyboard and screen-reader paths survive personalization.
