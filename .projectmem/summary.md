# projectmem - menuza-v2

_Last updated: 2026-11-17_

## Project purpose

Local development foundation for the Menuza product. Not the commerce product.

## Recent issues

- [OPEN] #0003 Android NativeTabs icons need expo-symbols; md names throw at runtime without it [apps/mobile-dashboard/src/app/(tabs)/_layout.tsx:27] (open)
- [DONE] #0009 uniwind-types.d.ts gitignored; CI mobile typecheck likely fails [apps/mobile-dashboard/metro.config.js] (fixed)
- [DONE] #0008 Sentry env documented as NEXT_PUBLIC_SENTRY_* but code reads VITE_SENTRY_* [apps/web/src/sentry.client.ts:16] (fixed)
- [DONE] #0007 Unchecked i32 money math, unbounded quantity, no overflow-checks in release [crates/persistence/src/commerce/orders.rs:928] (fixed)
- [DONE] #0006 Cancel/refund transitions skip wallet reserve release, stock return, cashback reversal [crates/persistence/src/commerce/orders.rs:429] (fixed)
- [DONE] #0005 Dashboard alarm loops forever on app open; usePreventRemove 'Descartar' never closes the screen [apps/mobile-dashboard/src/lib/alert.tsx:44] (fixed)
- [DONE] #0004 Dashboard Expo Go looped with 'Maximum update depth exceeded' after bun install swapped expo-router symlinks under a running Metro and a route file had no default export [apps/mobile-dashboard/src/app/(tabs)/_layout.tsx:25] (fixed)
- [DONE] #0002 Login/signup forms lose input on first submit: native form POST before React hydration wipes the fields [apps/web/src/features/auth/components/login-form.tsx] (fixed)
- [DONE] #0001 Substituição do pricingMode de kit por chargeExtra por prato [crates/persistence/migrations/0006_kit_item_charge_extra.sql] (fixed)
- [DONE] #legacy_0b43 Legacy issue: fix(web): simplify dashboard breadcrumb and keep sessions alive (fixed)

## Decisions

- No decisions logged yet.

## Notes

- chore(opencode): atualiza agentes, instrucoes e planos de tarefas
- feat(web): migrate dashboard to TanStack Start and restore UI parity
- chore(infra): run Valkey 9.1 instead of Redis 7.4
- chore(agents): raise critic step budget to 12
- New feature: feat(web): move login and onboarding to TanStack Form with Valibot [apps/web/src/features/auth/components/login-form.tsx]
- Kit ordering UX: HTML5 drag-and-drop for desktop paired with 1-tap ChevronUp/ChevronDown buttons for mobile touch/accessibility; group header layout expands name input without gap
- New feature: feat(catalog): kits with groups, ordering and storefront composer [apps/web/src/features/catalog/components/kit-form.tsx]
- gotcha: an SSR'd React form is interactive before hydration — a native submit posts the page URL and wipes every typed value; React only attaches onSubmit at hydration [apps/web/src/routes/__root.tsx]
- gotcha: Expo Go tunnel needs EXPO_PACKAGER_PROXY_URL, and the API origin must be the web proxy because /commerce and /tenant mounts are stripped there; :3001/:3002 404.
- gotcha: installing a package while Metro runs can swap node_modules symlinks (two expo-router store paths), producing 'Requiring unknown module' plus a Maximum-update-depth loop; a route file with no default export under the running bundler loops the same way. Fix = finish file writes, restart...

## Key files

- `apps/orpc-server/openapi/commerce.json`
- `apps/orpc-server/openapi/tenant.json`
- `apps/orpc-server/test/openapi.test.ts`
- `apps/web/src/lib/panel-labels.ts`
- `packages/shared/src/commerce/contract.ts`
- `packages/shared/src/commerce/index.ts`
- `packages/shared/src/commerce/orders/create-order.ts`
- `packages/shared/src/commerce/orders/types.ts`
- `packages/shared/src/commerce/payments/types.test.ts`
- `packages/shared/src/commerce/payments/types.ts`
- `packages/shared/src/panel/contracts.ts`
- `packages/shared/src/tenant/index.ts`
- `apps/orpc-server/package.json`
- `apps/orpc-server/src/auth/types.ts`
- `apps/orpc-server/src/crypto/index.ts`
- `apps/orpc-server/src/crypto/secrets.ts`
- `apps/orpc-server/test/secrets.test.ts`
- `packages/api-tenant/src/domains/tenant/subdomains/panel/deletePaymentIntegration.impl.ts`
- `packages/api-tenant/src/domains/tenant/subdomains/panel/getPaymentSettings.impl.ts`
- `packages/api-tenant/src/domains/tenant/subdomains/panel/paymentSupport.ts`

## Open questions

- None logged yet.
