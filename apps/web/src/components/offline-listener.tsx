"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { drainQueue } from "@menuza/offline";

/**
 * Bridges three drain triggers into the React tree:
 * 1. Service Worker `message` events (Background Sync fires `menuqueue-drain`).
 * 2. `menuza:conflict` events — refetch the affected query path when server-wins.
 * 3. `menuza:session-expired` events — invalidate everything; the auth layer
 *    (future) is responsible for redirecting to the sign-in page.
 */
export function OfflineListener() {
  const client = useQueryClient();

  useEffect(() => {
    const onSwMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "menuqueue-drain") {
        void drainQueue().then(() => client.invalidateQueries());
      }
    };

    const onConflict = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;

      if (detail?.url) {
        try {
          const path = new URL(detail.url, window.location.origin).pathname;
          void client.invalidateQueries({
            predicate: (q) => String((q.queryKey[0] as unknown) ?? "").startsWith(path),
          });
        } catch {
          void client.invalidateQueries();
        }
      } else {
        void client.invalidateQueries();
      }
    };

    const onSessionExpired = () => {
      void client.invalidateQueries();
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    window.addEventListener("menuza:conflict", onConflict);
    window.addEventListener("menuza:session-expired", onSessionExpired);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener("menuza:conflict", onConflict);
      window.removeEventListener("menuza:session-expired", onSessionExpired);
    };
  }, [client]);

  return null;
}
