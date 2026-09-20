import { getPublicKeyImpl } from "./getPublicKey.impl.ts";
import { subscribeImpl } from "./subscribe.impl.ts";
import { unsubscribeImpl } from "./unsubscribe.impl.ts";
import { getPreferencesImpl } from "./getPreferences.impl.ts";
import { updatePreferencesImpl } from "./updatePreferences.impl.ts";

export const pushSubdomainRouter = {
  getPublicKey: getPublicKeyImpl,
  subscribe: subscribeImpl,
  unsubscribe: unsubscribeImpl,
  getPreferences: getPreferencesImpl,
  updatePreferences: updatePreferencesImpl,
};

export type PushSubdomainRouter = typeof pushSubdomainRouter;
