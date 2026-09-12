/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { workerDrainQueue } from "@menuza/offline/worker-queue";

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
  runtimeCaching: defaultCache,
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
  if ((event.data as { type?: string } | null)?.type === "menuqueue-drain") {
    event.waitUntil(workerDrainQueue());
  }
});

serwist.addEventListeners();
