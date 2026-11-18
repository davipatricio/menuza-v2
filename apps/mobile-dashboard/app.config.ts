import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The operator app: one binary for every store, because a member can hold a
 * role in several stores and the membership list decides which one to open.
 *
 * There is no per-store build matrix here, and no `STORE_SLUG`: publishing one
 * binary per storefront is the storefront app's job.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Menuza Pedidos",
  slug: "menuza-dashboard",
  version: "1.0.0",
  scheme: "menuza-dashboard",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "app.menuza.dashboard",
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "app.menuza.dashboard",
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#191614",
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#191614",
      },
    ],
    "expo-sqlite",
    "expo-secure-store",
  ],
  updates: {
    url: process.env.EAS_UPDATE_URL,
    enabled: Boolean(process.env.EAS_UPDATE_URL),
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: "dashboard-v1",
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
