# apps/mobile-dashboard — AGENTS.md

The operator app: one binary for every store. Expo SDK 58, React Native 0.88,
React 19.3, `expo-router` (native tabs) and Uniwind. Parent rules: `/AGENTS.md`.

## Shape

- `app.config.ts` — one identity (`app.menuza.dashboard`), no `STORE_SLUG`.
- `src/app/(tabs)/**` — four surfaces mirroring the web sidebar: **Início**
  (`inicio.tsx`, the overview), **Pedidos** (`pedidos.tsx`, the order board),
  **Catálogo** (`catalogo.tsx`, the product browser) and **Mais**
  (`gestao.tsx`, the management hub). The order board owns the four queues —
  Novos, Preparo, Prontos and Histórico — as **segments inside one tab**, not
  four tabs: they are filters over the one `useOrders` query, and giving each
  one a tab left the bar with nothing for the rest of the dashboard.
- No tab file is named `index.tsx`: `src/app/index.tsx` is the session gate at
  `/` and redirects into `/(tabs)/inicio`. Two routes claiming `/` makes the
  router bounce between the login gate and the tab group.
- `NativeTabs` draws no navigation header: a tab screen carries its own title
  row, and `Stack.Screen options={{ title }}` / `headerRight` in a tab route is
  inert. Put the action in the body (see `catalog-browser.tsx`).
- `src/app/management/**` — the stack behind Mais, mirroring the web sidebar:
  catálogo (kits, departamentos, categorias, subcategorias, tags, etiquetas),
  cupons, clientes, auditoria, integrações and configurações (loja, entrega,
  pagamentos, notificações, equipe, conta). The overview and the products list
  are tabs now, so they are not repeated here. Read-only screens stay read-only;
  do not ship a half-editor.
- `src/app/order/[code].tsx` — one order, its items and the transitions the API
  allows for the caller's role.
- `src/components/management.tsx` — the one list/row/hub shape every management
  screen uses; a screen that hand-rolls a list instead is a bug.
- `src/components/form.tsx` — the one editor shape: `FormScreen`, `TextField`,
  `SwitchRow`, `ChipGroup`, `ChipMultiGroup`. Every write screen uses it.
- `src/components/pressable.tsx` — 90 ms press scale plus a selection haptic.
- `@expo/ui` supplies the native controls: `SwitchRow` wraps `Host` + `Switch`,
  and the order-reason prompt is a `BottomSheet` (`Host` + `isPresented` /
  `onDismiss`). Use the universal layer (`@expo/ui` root, not
  `@expo/ui/swift-ui` or `@expo/ui/jetpack-compose`) so one tree runs on both
  platforms and in Expo Go. `List` is a grouped form, not a virtualized list —
  long data stays on `FlashList`.
- `src/lib/theme-mode.tsx` — system/light/dark choice, stored in SQLite and
  applied through `Uniwind.setTheme` (which also drives `Appearance`).
- `src/lib/notifications.ts` — local new-order notification, permission request,
  and the notification-tap deep link.
- `src/lib/navigation.ts` — `useUnsavedChangesGuard` for editors.
- `src/lib/session.tsx` — the tenant session cookie in `expo-secure-store`,
  verified through `/session/current` on boot; memberships feed the store picker.
- `src/lib/api.ts` — absolute tenant origin and the session-cookie binding.
- `src/lib/alert.tsx` — looping new-order tone while any order is `pending`.
- `src/lib/orders.ts` — the shared 15-second poll.
- `global.css` — dashboard palette (the platform default, not a store theme).

## Rules

- Dashboard and storefront share one API client, one money formatter and one
  set of contract types. Do not copy a screen into this app.
- The session is a cookie: bind it with `bindSessionToken`, never read it from
  JS state, and clear it on sign-out. `resetApi` runs first so a revoked cookie
  never survives a re-login.
- Order transitions come from `GET …/transitions`, already filtered by the
  server for the caller's capability. Never derive who may cancel or refund on
  the device.
- A new order is alerted once and loops until it leaves `pending` (or the
  operator silences it for the session); no push producer exists yet.
- `NativeTabs.Trigger.Icon` needs `expo-symbols` for the Android `md` names;
  removing the dependency breaks every tab at runtime despite a clean bundle.
- A new order is announced once by a local notification and loops the tone until
  it leaves `pending`; remote push needs a dev build (MEN-317), so never claim the
  notification path proves push.
- Editors call `useUnsavedChangesGuard(dirty)`; it is Expo Router's
  `usePreventRemove`, which the native back gesture and the predictive back
  preview both consult.
- Lists pass `error={query.error}` to `ManagementList`; a failed read must never
  render as an empty store.
- Dashboard OTA preview runs against the web origin: the generated tenant paths
  carry the `/tenant` mount, so `EXPO_PUBLIC_TENANT_URL` is the web dev server
  (which proxies and strips the mount), not `:3002`.
- pt-BR copy; semantic token classes only.
- The store is addressed by the membership's `tenantSlug`, never by a
  client-chosen tenant id.
- Account deletion is a real `DELETE /account` call, never a request queue: the
  store the member solely owned is **archived**, so the copy must say the
  storefront leaves the air while the orders already issued stay valid. Apple
  5.1.1(v) and the Play User Data policy both require the deletion to be
  reachable inside the app, which is why it is a card on `settings/account`, not
  a mailto link.

## Verify

- `bunx oxfmt apps/mobile-dashboard && bunx oxlint apps/mobile-dashboard`
- `cd apps/mobile-dashboard && bun check`
- EAS: `eas.json` uses the `dashboard` channel and `runtimeVersion:
  "dashboard-v1"`; a dashboard OTA never reaches a storefront binary.
- Offline APK without EAS: `docs/agents/mobile.md` § Local Android APK
  (`assembleRelease` with `EXPO_PUBLIC_TENANT_URL` in the Gradle environment).
