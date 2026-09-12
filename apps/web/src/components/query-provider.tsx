"use client";

import { QueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { indexedDbPersister, startQueueDrainer } from "@menuza/offline";

/**
 * TanStack Query + offline persistence + background sync drain.
 *
 * Read-side: query cache is persisted to IndexedDB (`@menuza/offline/persister`).
 * Write-side: mutations made via this client can be enqueued via
 * `captureOfflineMutations(client, opts)` and replayed by the drainer.
 *
 * The drainer starts once on mount.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Network errors during offline should not pollute the cache as
            // hard errors that mark the query as failed forever.
            retry: (failureCount, _error) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) return false;

              return failureCount < 2;
            },
          },
        },
      }),
  );

  useEffect(() => startQueueDrainer(), []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister: indexedDbPersister,
        maxAge: 1000 * 60 * 60 * 24, // 24h
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
