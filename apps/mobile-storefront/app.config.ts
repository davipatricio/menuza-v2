import type { ConfigContext, ExpoConfig } from "expo/config";

import stores from "./stores.json";

/**
 * The per-store build matrix (MEN-313).
 *
 * One repository, one JS bundle, one EAS Update channel. `STORE_SLUG` only
 * changes native identity: the app label, the Android package, the icon and the
 * splash. The tenant the app talks to is never this value — a published binary
 * reads its own `Application.applicationId` at runtime, because the same update
 * bundle reaches every store.
 */
interface StoreEntry {
  name: string;
  package: string;
  iosBundleId: string;
  icon?: string;
  splash?: string;
}

// SAFETY: `stores.json` is the build matrix; a missing or malformed entry is
// rejected by the lookup and the throw below before EAS sees it.
const matrix = stores as Record<string, StoreEntry>;

const slug = process.env.STORE_SLUG;

const store = slug ? matrix[slug] : undefined;

if (slug && !store) {
  throw new Error(`STORE_SLUG "${slug}" has no entry in stores.json`);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: store?.name ?? "Menuza",
  slug: "menuza-storefront",
  version: "1.0.0",
  scheme: "menuza-storefront",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: store?.icon ?? "./assets/icon.png",
  ios: {
    bundleIdentifier: store?.iosBundleId ?? "app.menuza.storefront",
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: store?.package ?? "app.menuza.storefront",
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage: store?.icon ?? "./assets/adaptive-icon.png",
      backgroundColor: "#191614",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: store?.splash ?? "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#191614",
      },
    ],
    "expo-sqlite",
    [
      "expo-updates",
      {
        // A patch is only served when it is meaningfully smaller than the
        // embedded bundle (bsdiff, on by default since SDK 56).
        enableBsdiffPatchSupport: true,
      },
    ],
  ],
  updates: {
    url: process.env.EAS_UPDATE_URL,
    enabled: Boolean(process.env.EAS_UPDATE_URL),
    checkAutomatically: "ON_LOAD",
    // Never hold the splash screen on an update check.
    fallbackToCacheTimeout: 0,
  },
  // Static on purpose: every store binary shares the channel, so a fingerprint
  // that includes the package name would give each store its own runtime.
  runtimeVersion: "storefront-v1",
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
