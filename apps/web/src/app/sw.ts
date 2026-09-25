/* eslint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters */
/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { workerDrainQueue } from "../offline/worker-queue.ts";
import { cleanupOutdatedMenuzaCaches, createMenuzaRuntimeCaching } from "@/lib/sw-cache-rules.ts";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: createMenuzaRuntimeCaching(),
});

// Cache version cleanup on activate
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      if ("caches" in self) {
        await cleanupOutdatedMenuzaCaches(caches);
      }
    })(),
  );
});

interface NotificationPayloadRecord {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

function sanitizeNotificationDestination(urlCandidate: string | undefined): string {
  if (!urlCandidate) return "/";

  try {
    const parsed = new URL(urlCandidate, self.location.origin);

    // Only allow HTTP/HTTPS within the same origin
    if (parsed.origin !== self.location.origin) {
      return "/";
    }

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}

// Push notification receiver
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  try {
    // SAFETY: parsing push JSON payload into bounded notification record
    const raw = event.data.json() as NotificationPayloadRecord;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : "Menuza";
    const body = typeof raw.body === "string" ? raw.body : undefined;
    const icon = typeof raw.icon === "string" ? raw.icon : "/favicon.ico";
    const badge = typeof raw.badge === "string" ? raw.badge : undefined;
    const tag = typeof raw.tag === "string" ? raw.tag : undefined;

    const targetUrl = sanitizeNotificationDestination(
      typeof raw.url === "string" ? raw.url : undefined,
    );

    const options: NotificationOptions = {
      body,
      icon,
      badge,
      tag,
      data: {
        url: targetUrl,
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Plain text fallback
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Menuza", {
        body: text,
        icon: "/favicon.ico",
        data: { url: "/" },
      }),
    );
  }
});

// Notification click navigation handler
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  // SAFETY: notification data has been sanitized during showNotification
  const notifData = event.notification.data as { url?: string } | undefined;
  const relativeTarget = sanitizeNotificationDestination(notifData?.url);
  const absoluteTarget = new URL(relativeTarget, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === absoluteTarget && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteTarget);
      }

      return null;
    }),
  );
});

// Background Sync hook. The SW itself performs the replay so it works
// even with no open tabs.
self.addEventListener(
  "sync",
  (event: ExtendableEvent & { tag?: string; waitUntil: (p: Promise<unknown>) => void }) => {
    if (event.tag !== "menuqueue-replay") return;
    event.waitUntil(workerDrainQueue());
  },
);

// Best-effort: ask open pages to drain immediately on `online` (saves the
// SW registration round-trip).
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  // SAFETY: SW messages are untrusted; only the `type` field is read and it is
  // compared by strict equality against known tags. Unknown shapes are ignored.
  const data = event.data as { type?: string } | null;

  if (data?.type === "menuqueue-drain") {
    event.waitUntil(workerDrainQueue());
  }
});

serwist.addEventListeners();
