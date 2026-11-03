/**
 * Browser-side push subscription client.
 *
 * Same-origin REST calls to `/tenant/push/...` (proxied to the loopback tenant
 * API by the Vite dev server and the built app's server). Client components
 * only — never import this from server components.
 */
import type { RouterContractClient } from "@orpc/contract";
import type { PushEvent } from "@menuza/shared/push";
import type { tenantContractObject } from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import {
  getGetPushPreferencesUrl,
  getGetPushPublicKeyUrl,
  getSubscribePushUrl,
  getUnsubscribePushUrl,
  getUpdatePushPreferencesUrl,
} from "@/lib/api/tenant.ts";

type TenantClient = RouterContractClient<typeof tenantContractObject>;

/** One push procedure's contract output. */
type PushResult<K extends keyof TenantClient["push"]> = Awaited<
  ReturnType<TenantClient["push"][K]>
>;

/** Maps an API status to the code callers switch on; anything else is a failure. */
function statusError(status: number): Error {
  const message = `tenant ${status}`;

  switch (status) {
    case 400:
    case 422:
      return new ApiError("BAD_REQUEST", message);
    case 401:
      return new ApiError("UNAUTHORIZED", message);
    case 403:
      return new ApiError("FORBIDDEN", message);
    case 404:
      return new ApiError("NOT_FOUND", message);
    case 409:
      return new ApiError("CONFLICT", message);
    default:
      return new ApiError("INTERNAL_SERVER_ERROR", message);
  }
}

/** One same-origin request, carrying the httpOnly session cookie implicitly. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });

  if (!res.ok) throw statusError(res.status);

  const body = [204, 205, 304].includes(res.status) ? null : await res.text();

  // SAFETY: the route and the contract procedure document the same Rust DTO;
  // utoipa widens enum-valued fields to `string`, so the cast restores the
  // contract's narrower unions.
  return (body ? JSON.parse(body) : null) as T;
}

/** A write: JSON when there is a body, the contract's verb either way. */
function send<T, Body>(path: string, method: "POST" | "PUT" | "DELETE", body?: Body): Promise<T> {
  if (body === undefined) return request<T>(path, { method });

  return request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Thin wrapper over the push procedures of the tenant router. */
export const pushApi = {
  getPublicKey: () => request<PushResult<"getPublicKey">>(getGetPushPublicKeyUrl()),
  getPreferences: () => request<PushResult<"getPreferences">>(getGetPushPreferencesUrl()),
  updatePreferences: (events: PushEvent[]) =>
    send<PushResult<"updatePreferences">, { events: PushEvent[] }>(
      getUpdatePushPreferencesUrl(),
      "PUT",
      {
        events,
      },
    ),
  subscribe: (subscription: PushSubscriptionJSON) => {
    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      throw new Error("Assinatura de push inválida.");
    }

    return send<
      PushResult<"subscribe">,
      { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime: number | null }
    >(getSubscribePushUrl(), "POST", {
      endpoint,
      keys: { p256dh, auth },
      expirationTime: subscription.expirationTime ?? null,
    });
  },
  unsubscribe: (endpoint: string) =>
    send<PushResult<"unsubscribe">, { endpoint: string }>(getUnsubscribePushUrl(), "DELETE", {
      endpoint,
    }),
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
