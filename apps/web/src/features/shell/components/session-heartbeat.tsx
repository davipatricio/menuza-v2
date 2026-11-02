/**
 * Keeps a signed-in tab inside the session idle window.
 *
 * The tenant API slides the 24h idle deadline only when a request reaches it,
 * and a dashboard page can sit open for hours without a single call. One
 * throttled touch every five minutes (the API refreshes `lastUsedAt` at most
 * that often) is enough, and it only runs while the tab is visible.
 */
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { touchSessionFn } from "@/features/shell/server/store.functions.ts";

const HEARTBEAT_MS = 5 * 60_000;

export function SessionHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function beat() {
      if (document.visibilityState !== "visible") return;

      const status = await touchSessionFn().catch(() => "unavailable" as const);

      if (cancelled) return;

      if (status === "unauthenticated") {
        await router.navigate({
          to: "/dashboard/login",
          search: { returnTo: window.location.pathname },
          replace: true,
        });
      }
    }

    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}
