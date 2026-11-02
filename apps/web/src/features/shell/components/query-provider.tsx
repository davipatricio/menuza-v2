import type { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";
import { indexedDbPersister } from "@/offline/persister.ts";

/**
 * TanStack Query provider, persisted to IndexedDB.
 *
 * The same provider is rendered on the server and on the client, so the component
 * type never changes position in the tree: the route tree is never torn down and
 * remounted after hydration. `PersistQueryClientProvider` only restores in an
 * effect, so the server render is unaffected, and `indexedDbPersister` reaches
 * IndexedDB only when it is called.
 */
export function QueryProvider({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister: indexedDbPersister,
        maxAge: 86_400_000, // 24h
        buster: "v2",
        // Persistence is opt-in via `meta.persist`; nothing opts in yet, so an SSR
        // snapshot is never overwritten by IndexedDB. Offline screens that need it
        // will set `meta: { persist: true }`.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.meta?.persist === true,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
