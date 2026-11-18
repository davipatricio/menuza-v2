# Mobile (Expo) architecture

Two native apps share one contract, one API client and one palette with the web
storefront. They are not WebViews and they do not keep a second copy of the
business rules.

## Apps

| App                      | Binary identity                                                 | Tenant source                                       |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| `apps/mobile-storefront` | one published binary per large store, `app.menuza.store.<slug>` | `expo-application` `applicationId`, read at runtime |
| `apps/mobile-dashboard`  | one binary for every store, `app.menuza.dashboard`              | session cookie in `expo-secure-store`               |

Both run Expo SDK 58, React Native 0.88, React 19.3, the New Architecture,
`expo-router` and Uniwind (Tailwind 4 tokens on native).

## Data pipeline

```
screen → @menuza/api-client/{commerce,tenant}
       → apiFetch (origin + headers bound once)
       → Rust API (commerce :3001, tenant :3002)
```

- The generated client is the only HTTP layer. Operation ids are the API; a
  rename in `crates/openapi/*.json` regenerates the client and breaks callers.
- Web calls the same operations relatively (`/commerce/...`, `/tenant/...`) and
  the dev/prod proxy strips the mount. A native client has no page, so
  `configureApi({ origin })` supplies the absolute origin once.
- Storefront: `loadStore(slug)` binds `x-menuza-tenant-id` from
  `GET /commerce/stores/{slug}`. The slug comes from the package name; a dev
  build asks once and stores it in SQLite.
- Dashboard: login returns `menuza_tenant_sid`; `bindSessionToken(token)` stores
  it in SecureStore and binds the `cookie` header. `resetApi()` runs first, so a
  revoked cookie never survives a re-login.
- TanStack Query holds every read; the dashboard polls orders every 15 s, the
  storefront persists the cache in SQLite for a fast first paint.
- Money always renders through `formatBrl` from `@menuza/shared/money`.

## Theme

`PublicStore.theme` is resolved by the API: three saved colors (or platform
defaults), the WCAG ink for each surface and a base radius. Web writes the
values as CSS variables; native writes the same token names through
`Uniwind.updateCSSVariables("light", …)`. No store color is compiled into the
bundle.

The dashboard has its own light/dark palette in `global.css`
(`@layer theme { :root { @variant light / @variant dark } }`), mirroring
`apps/web/src/styles/globals.css`. `src/lib/theme-mode.tsx` stores the operator's
choice (system / light / dark) in SQLite and calls `Uniwind.setTheme`, which also
sets `Appearance.setColorScheme`, so native headers and tab bars follow. The
storefront does not switch palettes: its colors belong to the store.

## Navigation and gestures

- Storefront: `Stack` over a flat menu, product detail and kit composition.
- Dashboard: four native tabs mirroring the web sidebar — **Início** (overview),
  **Pedidos** (the order board), **Catálogo** (products) and **Mais** — with a
  `management/` stack behind the last one. The board's four queues (Novos,
  Preparo, Prontos, Histórico) are **segments inside Pedidos**, because they are
  filters over the one `useOrders` query; four tabs for one query left no room
  for the rest of the dashboard. The management stack mirrors the rest of the web
  sidebar: Catálogo (kits, departamentos, categorias, subcategorias, tags,
  etiquetas), Cupons, Clientes, Auditoria, Integrações, Configurações (loja,
  entrega, pagamentos, notificações, equipe, conta).
- `NativeTabs` renders **no navigation header**: a tab screen carries its own
  title row, and `Stack.Screen options={{ title }}`/`headerRight` inside a tab
  route does nothing. Put the action in the body.
- Both apps set `android.predictiveBackGestureEnabled`, and every `Stack` uses
  `animation: "slide_from_right"` plus `gestureEnabled`/`fullScreenGestureEnabled`.
  Predictive back needs a development build or a store build; Expo Go ignores the
  manifest flag.
- An editor guards unsaved work with `useUnsavedChangesGuard(dirty)` from
  `src/lib/navigation.ts` — Expo Router's `usePreventRemove`, which is also what
  the native back gesture consults.
- `NativeTabs.Trigger.Icon` needs `expo-symbols` for the Android `md` names.
  Without it, Android tab icons fail at runtime even though the JS bundles.

## Native controls (`@expo/ui`)

`@expo/ui` 58.0.28 renders real SwiftUI / Jetpack Compose from React. Use the
**universal** layer (`import { Host, Switch, BottomSheet } from "@expo/ui"`), not
`@expo/ui/swift-ui` or `@expo/ui/jetpack-compose`: the universal tree runs on
both platforms and ships inside Expo Go, so the tunnel preview keeps working.
The platform-specific layers would need `.ios.tsx` / `.android.tsx` splits and a
development build.

- Every native tree needs `Host`. `Host matchContents` sizes a single control
  such as the dashboard `SwitchRow` toggle.
- Sheets are `BottomSheet` with `isPresented` / `onDismiss` (the order-reason
  prompt). Do not add `@gorhom/bottom-sheet` or a Reanimated imitation.
- `BottomSheet` children are React Native views, so Uniwind token classes keep
  working inside the sheet; the sheet chrome itself is native.
- `List` is a grouped form (iOS Settings look), not a virtualized list. Catalogs,
  orders and every other long collection stay on `FlashList`.
- Chips stay hand-rolled (`ChipGroup` / `ChipMultiGroup`): they carry
  multi-selection and the compact density the editors need, which the native
  `Picker` does not.

## Notifications, caching and motion

- The dashboard announces a new `pending` order with a local notification
  (`expo-notifications`): the first board snapshot seeds the seen list, later
  codes announce once, and tapping one opens `/order/<code>`. Remote push needs a
  development build on Android (Expo Go dropped it in SDK 53) and the backend
  producer tracked in MEN-317.
- TanStack Query persists both apps' caches in `expo-sqlite/kv-store`; the
  dashboard clears the cache on sign-in and sign-out so one member never reads
  another's rows. Storefront images go through `expo-image` with
  `cachePolicy="memory-disk"` and a 120 ms transition.
- Motion stays short: 90 ms press scale with a selection haptic
  (`components/pressable.tsx`), 25 ms stagger on hub rows, native stack slides.
  Do not add spring animations to recycled list rows.

## OTA and builds

- `eas.json` puts each app on its own Update channel (`storefront`,
  `dashboard`); a dashboard OTA never reaches a storefront binary.
- `runtimeVersion` is static per app (`storefront-v1`, `dashboard-v1`), because
  every store binary shares one JS bundle.
- `bun run store:build <slug> --platform android` validates that the slug can be
  a package segment and that `stores.json` declares `app.menuza.store.<slug>`.
- `bun run store:update <slug> --message "…"` publishes one OTA for every store
  binary.

## Local Android APK

The EAS path above is the publishing path. This is the offline path: one
`assembleRelease` on a dev box, no EAS login, producing an installable APK.

### Toolchain

Verified with JDK 17 and the SDK below; the React Native template targets 17.

| Piece       | Version                                   | Notes                                            |
| ----------- | ----------------------------------------- | ------------------------------------------------ |
| JDK         | `openjdk-17-jdk-headless`                 | `java -version` must report 17                   |
| Build tools | `build-tools;36.0.0`                      | `apksigner`, `aapt2`, `d8`                       |
| Platform    | `platforms;android-36` (+ `android-37.0`) | Gradle picks `rootProject.ext.compileSdkVersion` |
| NDK         | `27.1.12297006`                           | required by the New Architecture                 |
| CMake       | any SDK copy                              | `sdkmanager "cmake;3.22.1"`                      |

The SDK is found through `ANDROID_HOME`/`ANDROID_SDK_ROOT` or, more reliably,
`android/local.properties`:

```properties
sdk.dir=/opt/android-sdk
```

`android/` is gitignored (`apps/mobile-*/android/`), so generate it once:

```bash
cd apps/mobile-dashboard
bunx expo prebuild --platform android
```

Prebuild writes `android/app/debug.keystore` and the Gradle 9.4.1 wrapper. Every
value in `app.config.ts` (`applicationId`, icon, splash, plugins,
`predictiveBackGestureEnabled`) is applied to the native project at this step, so
re-run prebuild after changing it — a rebuild alone will not pick the change up.

### Build

```bash
cd apps/mobile-dashboard/android

EXPO_PUBLIC_TENANT_URL=https://<web-origin> \
./gradlew assembleRelease \
  --no-daemon --max-workers=1 \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=false \
  -Dorg.gradle.jvmargs="-Xmx3072m -XX:MaxMetaspaceSize=512m"
```

`EXPO_PUBLIC_TENANT_URL` must be in the **Gradle** environment, not just the
shell that started Metro: release builds run `bundleCommand = "export:embed"`,
which calls Metro inside the build. Without it `src/lib/api.ts` takes the
production branch of its `__DEV__` ternaries and the origin is `""`, so every
request fails on the device. The storefront uses `EXPO_PUBLIC_COMMERCE_URL`.

The three memory flags are what make this work on a small machine:

- `-PreactNativeArchitectures=arm64-v8a` builds one ABI instead of four. Drop the
  flag (or list more) for an emulator or a 32-bit device; it does not change
  correctness, only ABI coverage and build time.
- `-Pandroid.enableMinifyInReleaseBuilds=false` skips R8. The default
  `android.enableMinifyInReleaseBuilds=true` in `gradle.properties` trips the
  heap limit on an 8 GB box. Cost: a larger `classes.dex`.
- `--no-daemon --max-workers=1` stops the Gradle, Kotlin and CXX workers from
  competing for RAM at the same time.

Both the 4-ABI build and the R8 build died of OOM with Gradle's default
`-Xmx2048m`. If a retry fails the same way, stale workers are usually still
resident — `pkill -f GradleDaemon; pkill -f KotlinCompileDaemon; pkill -f
cxx-build` — and so are Metro and the Vite dev server. Stop them first.

Reference result for the dashboard, arm64 with R8 off: `14m 29s`,
`app-release.apk` 51,112,595 B, `assets/index.android.bundle` 4,305,524 B.

### Output and install

```
apps/mobile-dashboard/android/app/build/outputs/apk/release/app-release.apk
```

```bash
adb install -r app-release.apk            # device attached
adb reverse tcp:3004 tcp:3004             # only for a local-origin build
```

Side-loading from a link works too; serve the file on any origin, since the
installer needs the MIME type, not a store:

```bash
python3 -m http.server 8099 --bind 127.0.0.1   # .apk → application/vnd.android.package-archive
cloudflared tunnel --url http://127.0.0.1:8099
```

Check the transfer before sending the link — `content-length` must equal the file
size, and the first bytes must be `50 4b 03 04` (`curl -sSI`, then
`curl -r 0-3 … | xxd`).

### Verify what shipped

```bash
ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs app-release.apk
unzip -l app-release.apk | grep -E 'index.android.bundle|classes.dex'
unzip -p app-release.apk assets/index.android.bundle | grep -c 'pedidos'
```

The bundle is Hermes bytecode, but route names and inlined `EXPO_PUBLIC_*`
strings survive as literals, so a grep proves the screen and the origin reached
the binary. `apksigner` reporting `CN=Android Debug` is expected — see below.

### Caveats

- **Debug-signed.** `app/build.gradle` signs `release` with `signingConfigs.debug`
  (the RN template default), so the APK installs but Play Console rejects it. A
  publishable build needs its own keystore, a `signingConfigs.release` block and
  the credentials outside the repo.
- **Origin is baked in.** `configureApi({ origin })` runs once at module load, so
  rotating the tunnel host means rebuilding. A stable origin is worth setting
  before handing the APK to anyone.
- **One ABI.** An `arm64-v8a` APK does not install on an x86_64 emulator; use a
  physical device or rebuild with `-PreactNativeArchitectures=x86_64`.
- **No OTA.** `updates.url` comes from `EAS_UPDATE_URL` and stays disabled when
  it is unset, so this APK only changes with a new build.

## Expo Go preview (remote host)

Expo Go talks to Metro over HTTPS, and the app talks to the API through the web
origin because the generated paths carry the `/commerce` and `/tenant` mounts.

1. Run the web dev server (it proxies `/commerce` and `/tenant` to the Rust
   APIs): `bun run dev`.
2. Tunnel Metro and the web origin with any HTTPS tunnel (Cloudflare quick
   tunnels work): `cloudflared tunnel --url http://127.0.0.1:<port>`.
3. Start Metro with both URLs:
   `EXPO_PUBLIC_COMMERCE_URL=https://<web> EXPO_PACKAGER_PROXY_URL=https://<metro> bunx expo start --go`.
   The dashboard uses `EXPO_PUBLIC_TENANT_URL` instead.
4. Open `exps://<metro-host>` in Expo Go (SDK 58). A dev storefront build shows
   the slug picker.

`EXPO_PACKAGER_PROXY_URL` is what makes the manifest and the bundle URLs point
at the tunnel; without it Expo Go receives `http://localhost` URLs and fails.

## Checks

- `cd apps/mobile-storefront && bun check`, same for `mobile-dashboard`.
- `bunx oxfmt <paths>` then `bunx oxlint <paths>`; the repo-wide `bun run lint`
  and `bun run fmt:check` include both apps.
- A JS bundle check catches resolution errors that `bun check` cannot:
  request the manifest and then `launchAsset.url` from the Metro origin.
- Expo Go cannot run code that needs a native module absent from Expo Go; the
  current dependency set (FlashList v2, Uniwind, expo-sqlite, expo-secure-store,
  expo-audio, expo-symbols) is included.
