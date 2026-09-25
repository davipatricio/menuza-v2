/**
 * IndexedDB-backed persister for TanStack Query.
 * Stores query cache in IndexedDB via `idb-keyval` so the cache survives reloads
 * and offline restarts. Read-side cache only — writes during offline are queued
 * by `sync-queue.ts`.
 */
import { get, set as idbSet, del as idbDel, createStore } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/query-persist-client-core";

const STORE = createStore("menuza-query-cache", "queries");

export const indexedDbPersister: Persister = {
  async persistClient(client: PersistedClient): Promise<void> {
    await idbSet("persisted", client, STORE);
  },
  async restoreClient(): Promise<PersistedClient | undefined> {
    return (await get<PersistedClient>("persisted", STORE)) ?? undefined;
  },
  async removeClient(): Promise<void> {
    await idbDel("persisted", STORE);
  },
};
