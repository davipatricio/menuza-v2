/**
 * Client entry. Replaces the plugin's default hydration entry so the browser
 * Sentry SDK initialises once before React mounts. Keeping the import here — and
 * not in `router.tsx` — keeps the client-only module out of the server graph,
 * which Start's import protection refuses for client-only module names.
 */
import "@/sentry.client.ts";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
