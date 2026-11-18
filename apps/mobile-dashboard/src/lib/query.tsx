import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, MutationCache, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { errorFeedback, successFeedback } from "./feedback.ts";

/**
 * The storefront query cache, persisted in SQLite.
 *
 * A buyer on a weak connection opens the app to the menu they last saw instead
 * of an empty screen; the refetch runs on top of it. `staleTime` is short
 * because a published dish disappearing matters more than a saved request.
 */
const persister = createAsyncStoragePersister({
  storage: Storage,
  key: "menuza-storefront-query",
  throttleTime: 1000,
});

function createClient() {
  return new QueryClient({
    // Every write answers with a vibration: success and failure must not feel
    // the same, and a screen that forgets to wire it still gets it.
    mutationCache: new MutationCache({
      onSuccess: () => successFeedback(),
      onError: () => errorFeedback(),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createClient);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });

    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  );
}
