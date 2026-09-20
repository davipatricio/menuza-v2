/**
 * Framework-free push subscription logic. Every function takes an optional
 * dependency bag so it can be exercised in tests without a browser; defaults
 * read the real globals and the same-origin API client.
 *
 * The browser types are narrowed to the exact surface the module uses, so
 * fakes in tests are structurally valid without type assertions.
 */
import type { PushEvent } from "@menuza/shared/push";
import {
  getPushPreferences,
  getVapidPublicKey,
  registerSubscription,
  setPushPreferences,
  unregisterSubscription,
} from "./push-client.ts";

export const PUSH_STATE = ["unsupported", "denied", "subscribed", "unsubscribed"] as const;

export type PushState = (typeof PUSH_STATE)[number];

export interface NotificationLike {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
}

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}

export interface PushManagerLike {
  getSubscription(): Promise<PushSubscriptionLike | null>;
  subscribe(options: PushSubscriptionOptionsInit): Promise<PushSubscriptionLike>;
}

export interface ServiceWorkerContainerLike {
  register(scriptURL: string): Promise<{ pushManager: PushManagerLike }>;
}

export interface PushApi {
  registerSubscription(subscription: PushSubscriptionJSON): Promise<void>;
  unregisterSubscription(endpoint: string): Promise<void>;
  getPushPreferences(): Promise<PushEvent[]>;
  setPushPreferences(events: PushEvent[]): Promise<void>;
  getVapidPublicKey(): Promise<string>;
}

export interface PushDependencies {
  serviceWorkerContainer?: ServiceWorkerContainerLike;
  pushManager?: PushManagerLike;
  notification?: NotificationLike;
  api?: PushApi;
  isSecureContext?: boolean;
}

interface ResolvedDependencies {
  serviceWorkerContainer?: ServiceWorkerContainerLike;
  pushManager?: PushManagerLike;
  notification?: NotificationLike;
  api: PushApi;
  isSecureContext: boolean;
}

export type EnablePushResult = { ok: true } | { ok: false; reason: string };

const SERVICE_WORKER_URL = "/serwist/sw.js";

const defaultApi: PushApi = {
  registerSubscription,
  unregisterSubscription,
  getPushPreferences,
  setPushPreferences,
  getVapidPublicKey,
};

function resolveDependencies(overrides?: PushDependencies): ResolvedDependencies {
  return {
    serviceWorkerContainer:
      overrides?.serviceWorkerContainer ?? globalThis.navigator?.serviceWorker,
    pushManager: overrides?.pushManager,
    notification: overrides?.notification ?? globalThis.Notification,
    api: overrides?.api ?? defaultApi,
    isSecureContext: overrides?.isSecureContext ?? globalThis.isSecureContext === true,
  };
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const normalized = base64.trim().replace(/=+$/, "");

  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("Chave pública VAPID inválida.");
  }

  const padded = normalized
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function isPushSupported(deps?: PushDependencies): boolean {
  const resolved = resolveDependencies(deps);

  return (
    resolved.isSecureContext &&
    resolved.serviceWorkerContainer !== undefined &&
    resolved.notification !== undefined
  );
}

async function resolvePushManager(
  deps: ResolvedDependencies,
): Promise<PushManagerLike | undefined> {
  if (deps.pushManager) return deps.pushManager;

  if (!deps.serviceWorkerContainer) return undefined;

  const registration = await deps.serviceWorkerContainer.register(SERVICE_WORKER_URL);

  return registration.pushManager;
}

export async function syncSubscriptionState(deps?: PushDependencies): Promise<PushState> {
  const resolved = resolveDependencies(deps);

  if (!isPushSupported(resolved)) return "unsupported";

  if (resolved.notification?.permission === "denied") return "denied";

  const manager = await resolvePushManager(resolved);

  if (!manager) return "unsupported";

  const subscription = await manager.getSubscription();

  // ponytail: browser state only — a push subscription lives on the browser and
  // is not per-account, so after switching accounts in the same browser this
  // still reports "subscribed" even if the new account never opted in.
  // Upgrade path: reconcile server-side preferences/subscription rows for the
  // active account before trusting this value.
  return subscription ? "subscribed" : "unsubscribed";
}

export async function enablePush(deps?: PushDependencies): Promise<EnablePushResult> {
  const resolved = resolveDependencies(deps);

  if (!isPushSupported(resolved)) return { ok: false, reason: "unsupported" };

  const notification = resolved.notification;

  if (!notification) return { ok: false, reason: "unsupported" };

  if (notification.permission === "denied") return { ok: false, reason: "denied" };

  const permission =
    notification.permission === "granted"
      ? notification.permission
      : await notification.requestPermission();

  if (permission !== "granted") return { ok: false, reason: "denied" };

  const manager = await resolvePushManager(resolved);

  if (!manager) return { ok: false, reason: "unsupported" };

  const publicKey = await resolved.api.getVapidPublicKey();

  const subscription = await manager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  try {
    await resolved.api.registerSubscription(subscription.toJSON());
  } catch (err) {
    // Rollback must not mask the original registration failure.
    try {
      await subscription.unsubscribe();
    } catch {
      // Browser subscription may already be gone; nothing else to do.
    }

    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Falha ao registrar as notificações.",
    };
  }

  return { ok: true };
}

export async function disablePush(deps?: PushDependencies): Promise<void> {
  const resolved = resolveDependencies(deps);

  const manager = await resolvePushManager(resolved);

  if (!manager) return;

  const subscription = await manager.getSubscription();

  if (!subscription) return;

  // Server first: if it fails, the browser subscription stays active so the
  // next sync still sees a consistent state.
  await resolved.api.unregisterSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}

export async function loadPushPreferences(deps?: PushDependencies): Promise<PushEvent[]> {
  return resolveDependencies(deps).api.getPushPreferences();
}

export async function updatePushPreferences(
  events: PushEvent[],
  deps?: PushDependencies,
): Promise<void> {
  await resolveDependencies(deps).api.setPushPreferences(events);
}
