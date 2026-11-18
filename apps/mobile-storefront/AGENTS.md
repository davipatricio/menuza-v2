# apps/mobile-storefront — AGENTS.md

The buyer app: the published storefront for one large store per binary. Expo
SDK 58, React Native 0.88, React 19.3, `expo-router` and Uniwind (Tailwind v4 on
native). Parent rules: `/AGENTS.md`.

## Shape

- `app.config.ts` — per-store native identity from `stores.json` through
  `STORE_SLUG`. `STORE_SLUG` never reaches the JS bundle's tenant decision.
- `stores.json` — slug → display name, Android package, iOS bundle id, icon and
  splash. A published package is exactly `app.menuza.store.<tenantSlug>`.
- `src/app/**` — `expo-router` screens: flat menu (`index`), product, kit.
- `src/components/**` — presentational pieces shared by the screens.
  `pressable.tsx` is the 90 ms press scale; images use `expo-image` with
  `cachePolicy="memory-disk"` so a menu reopened offline keeps its covers.
- `src/lib/store.tsx` — resolves the tenant, loads the store and gates the tree.
- `src/lib/api.ts` — absolute commerce origin and tenant-header binding.
- `src/lib/theme.ts` — writes `PublicStore.theme` into the Uniwind CSS variables.
- `src/lib/query.tsx` — TanStack Query persisted in `expo-sqlite/kv-store`.
- `global.css` — the platform default palette; the API-resolved theme overwrites
  the same variables at runtime.

## The tenant is runtime data

Every store binary shares one EAS Update channel and one JS bundle, so nothing
per-store may be compiled in.

- The tenant comes from `applicationId` at launch
  (`app.menuza.store.<slug>` → `<slug>`), then `GET /commerce/stores/{slug}`.
- The returned `tenantId` is bound as `x-menuza-tenant-id` for every later read.
- A development build is not a published store: it asks for a slug once and
  keeps it in SQLite.
- A store that cannot resolve is a screen, not a crash, and never falls back to
  another tenant.

## Theme

`PublicStore.theme` is already resolved: saved colors or platform defaults, plus
the ink contrast picked on the server. `applyStoreTheme` only maps those values
onto the token names `global.css` declares. Never derive a store color, radius
or foreground in this app.

`global.css` lives at the app root and is imported by `src/app/_layout.tsx` as
`../../global.css`. A `../global.css` breaks the Metro bundle even though
`bun check` passes.

## Rules

- Use `@menuza/api-client/commerce` and `@menuza/api-client/model`, never a
  hand-written fetch. `configureApi` owns the origin and the headers.
- Money renders through `formatBrl` from `@menuza/shared/money`; cents stay
  integers.
- pt-BR copy; semantic token classes only (`bg-background`, `text-foreground`,
  `border-border`), never a raw palette class or a hard-coded hex.
- Catalogue reads are anonymous but tenant-scoped; every screen relies on the
  header bound in `loadStore`, so a new call needs no per-call tenant argument.
- The buyer checkout is not implemented anywhere: `POST /commerce/orders`
  requires a store member with `orders:write`, and the web storefront has no cart
  either. Do not add a mobile-only checkout that bypasses that gate.
- New native dependencies go through `bunx expo install` and the root catalog
  when another workspace uses them.
- `android.predictiveBackGestureEnabled` and the stack's `gestureEnabled` are
  what make back feel native; they only take effect in a dev/store build, not in
  Expo Go.

## Verify

- `bunx oxfmt apps/mobile-storefront && bunx oxlint apps/mobile-storefront`
- `cd apps/mobile-storefront && bun check`
- `bun run store:build <slug> --platform android` — EAS build of one store; the
  script validates the slug and package before invoking EAS.
- `bun run store:update <slug> --message "…"` — one OTA bundle for every store
  binary on the `storefront` channel.
- Offline APK without EAS: `docs/agents/mobile.md` § Local Android APK
  (`assembleRelease` with `EXPO_PUBLIC_COMMERCE_URL` in the Gradle environment).
