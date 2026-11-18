import { configureApi, resetApi } from "@menuza/api-client/http";
import { Platform } from "react-native";

/**
 * The tenant origin, absolute because a native client has no page to be
 * relative to. The emulator default exists in development only.
 */
const devOrigin = Platform.select({
  android: "http://10.0.2.2:3002",
  default: "http://127.0.0.1:3002",
});

export const tenantOrigin =
  process.env.EXPO_PUBLIC_TENANT_URL ?? (__DEV__ ? (devOrigin ?? "") : "");

/** The session cookie the tenant API sets on login. */
const TENANT_COOKIE = "menuza_tenant_sid";

configureApi({ origin: tenantOrigin });

/**
 * Rebinds every later request to one session token.
 *
 * `resetApi` first: the generated client merges the configured headers, so a
 * plain second call would keep a revoked cookie on the wire.
 */
export function bindSessionToken(token: string | null): void {
  resetApi();
  configureApi({ origin: tenantOrigin });

  if (token) configureApi({ headers: { cookie: `${TENANT_COOKIE}=${token}` } });
}

/** The `menuza_tenant_sid` value from a login response, if it opened one. */
export function sessionTokenFrom(headers: Headers): string | null {
  const raw = headers.get("set-cookie");

  if (!raw) return null;

  const match = new RegExp(`${TENANT_COOKIE}=([^;]+)`).exec(raw);

  return match?.[1] ?? null;
}
