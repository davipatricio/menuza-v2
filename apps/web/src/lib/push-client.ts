/**
 * Browser-side push subscription client.
 *
 * Same-origin calls to `/tenant/rpc` (rewritten to the loopback tenant API by
 * `next.config.ts`). Client components only — never import this from server
 * components.
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import type { PushEvent } from "@menuza/shared/push";
import type { tenantContractObject } from "@menuza/shared/tenant";

type TenantClient = RouterContractClient<typeof tenantContractObject>;

function client(): TenantClient {
  return createORPCClient<TenantClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/** Thin wrapper over the push procedures of the tenant router. */
export const pushApi = {
  getPublicKey: () => client().push.getPublicKey(),
  getPreferences: () => client().push.getPreferences(),
  updatePreferences: (events: PushEvent[]) => client().push.updatePreferences({ events }),
  subscribe: (subscription: PushSubscriptionJSON) => {
    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      throw new Error("Assinatura de push inválida.");
    }

    return client().push.subscribe({
      endpoint,
      keys: { p256dh, auth },
      expirationTime: subscription.expirationTime ?? null,
    });
  },
  unsubscribe: (endpoint: string) => client().push.unsubscribe({ endpoint }),
};

export async function registerSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await pushApi.subscribe(subscription);
}

export async function unregisterSubscription(endpoint: string): Promise<void> {
  await pushApi.unsubscribe(endpoint);
}

export async function getPushPreferences(): Promise<PushEvent[]> {
  const result = await pushApi.getPreferences();

  return result.events;
}

export async function setPushPreferences(events: PushEvent[]): Promise<void> {
  await pushApi.updatePreferences(events);
}

export async function getVapidPublicKey(): Promise<string> {
  const result = await pushApi.getPublicKey();

  return result.publicKey;
}
