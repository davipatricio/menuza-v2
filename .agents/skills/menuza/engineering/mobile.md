# mobile

The two Expo apps and everything they share with the web. Parent:
`../SKILL.md`. Detailed operator recipe: `docs/agents/mobile.md`.

## Shape

- `apps/mobile-storefront` — buyer app; one published binary per large store,
  package `app.menuza.store.<tenantSlug>`; tenant read from `applicationId` at
  runtime, never compiled in.
- `apps/mobile-dashboard` — operator app; one binary for every store; tenant
  from the membership selected after login; session cookie in SecureStore.
- `packages/api-client` — the one generated client. `src/http.ts` binds the
  origin and headers. Never hand-write a fetch in an app.
- `packages/shared` — money formatter (`/money`), legacy contract types, push
  helpers. Business rules stay in Rust; the apps only render.

## Pipeline

```
screen → @menuza/api-client → apiFetch(origin, headers) → Rust API
```

- Web origin is relative (`/commerce`, `/tenant`); the proxy strips the mount.
  Native sets an absolute origin once with `configureApi`.
- Storefront: `GET /commerce/stores/{slug}` → `tenantId` bound as
  `x-menuza-tenant-id` for every later read.
- Dashboard: `POST /tenant/session/login` → `menuza_tenant_sid` cookie →
  `bindSessionToken`; `/session/current` on boot; memberships drive the store
  picker.
- TanStack Query owns reads; keys start with the domain and include
  `storeSlug`. Orders poll every 15 s; the storefront persists its cache in
  SQLite.

## Theme

`PublicStore.theme` is already resolved (saved colors or defaults, WCAG ink,
radius). Native maps it to Uniwind variables with `applyStoreTheme`; web maps it
to CSS variables. Never derive a store color in an app. The dashboard theme
editor saves through `PUT /panel/stores/{slug}/theme` with `branding:write`.

## Navigation

- Storefront: menu → product → kit, all inside one `Stack`.
- Dashboard: native tabs Novos / Preparo / Prontos / Histórico / Gestão; the
  Gestão tab opens the `management/` stack that mirrors the web sidebar
  (visão geral, catálogo, cupons, clientes, auditoria, integrações,
  configurações). A section that only reads on mobile says so; it does not grow
  a half-form.
- `NativeTabs.Trigger.Icon md="…"` requires `expo-symbols`; without it Android
  tab icons fail at runtime.

## OTA

- One EAS Update channel per app (`storefront`, `dashboard`); static
  `runtimeVersion` per app.
- `bun run store:build <slug> --platform android|ios` — one build, validated
  against `stores.json`.
- `bun run store:update <slug> --message "…"` — one OTA for every store binary.

## Preview

Expo Go needs HTTPS for both Metro and the API. Run the web dev server (it
proxies the API mounts), tunnel it and Metro, then start Metro with
`EXPO_PUBLIC_COMMERCE_URL` (storefront) or `EXPO_PUBLIC_TENANT_URL` (dashboard)
plus `EXPO_PACKAGER_PROXY_URL`, and open `exps://<metro-host>`.

## Checks

- `cd apps/mobile-storefront && bun check`; same for `mobile-dashboard`.
- `bunx oxfmt <paths>` then `bunx oxlint <paths>`.
- Bundle check for resolution errors `bun check` misses: fetch the Metro
  manifest, then `launchAsset.url`.
- Nothing here commits, stages, or runs EAS without an explicit request.
