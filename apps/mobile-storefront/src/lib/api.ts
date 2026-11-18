import { getPublicStoreBySlug } from "@menuza/api-client/commerce";
import { configureApi } from "@menuza/api-client/http";
import type { PublicStore } from "@menuza/api-client/model";
import { Platform } from "react-native";

import { applyStoreTheme } from "./theme.ts";

/**
 * The commerce origin. A native client has no page to be relative to, so the
 * generated `/commerce/...` paths need an absolute base before the first call.
 *
 * The emulator default only exists in development; a release build without
 * `EXPO_PUBLIC_COMMERCE_URL` fails loudly instead of talking to the device.
 */
const devOrigin = Platform.select({
  android: "http://10.0.2.2:3001",
  default: "http://127.0.0.1:3001",
});

export const commerceOrigin =
  process.env.EXPO_PUBLIC_COMMERCE_URL ?? (__DEV__ ? (devOrigin ?? "") : "");

configureApi({ origin: commerceOrigin });

export class StoreUnavailableError extends Error {
  constructor(slug: string) {
    super(`A loja "${slug}" não está disponível.`);
    this.name = "StoreUnavailableError";
  }
}

/**
 * Resolves a store by slug and binds the tenant every later read claims.
 *
 * Storefront reads are anonymous but tenant-scoped: the header is the claim the
 * edge would otherwise derive from the host.
 */
export async function loadStore(slug: string): Promise<PublicStore> {
  const response = await getPublicStoreBySlug(slug);
  const store = response.status === 200 ? response.data : null;

  if (!store?.tenantId) throw new StoreUnavailableError(slug);

  configureApi({ headers: { "x-menuza-tenant-id": store.tenantId } });
  applyStoreTheme(store.theme);

  return store;
}
