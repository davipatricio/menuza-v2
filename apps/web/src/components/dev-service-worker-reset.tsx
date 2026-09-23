"use client";

import { useEffect } from "react";

/**
 * Development-only service-worker reset.
 *
 * The production service worker caches `/_next/static/**` with `CacheFirst`
 * for 30 days, keyed by a build revision that is constant in development.
 * Turbopack also reuses chunk URLs across edits, so a dev browser that once
 * registered the worker keeps serving the first CSS/JS it ever cached,
 * against freshly rendered markup. That silently desynchronises the theme.
 *
 * Renders nothing; unregisters every service worker and drops every Cache
 * Storage bucket once, then reloads so the tab is no longer controlled.
 */
export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const reset = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = await caches.keys();

      if (registrations.length === 0 && cacheKeys.length === 0) return;

      if (registrations.some((registration) => registration.active)) {
        // Avoid a reload loop: only reload when a worker was actually controlling.
        sessionStorage.setItem("menuza-sw-reset", "pending");
      }

      await Promise.all(registrations.map((registration) => registration.unregister()));
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));

      if (cancelled) return;

      if (sessionStorage.getItem("menuza-sw-reset") === "pending") {
        sessionStorage.removeItem("menuza-sw-reset");
        location.reload();
      }
    };

    void reset();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
