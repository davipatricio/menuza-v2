/**
 * Server functions for the settings screens.
 *
 * Settings has no model of its own yet, so every page needs the same two
 * things: the store behind `panel.getStore` (the authority for "may this member
 * be here") and, on the store page, its SEO defaults.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { PanelStoreSeo } from "@menuza/shared/tenant";
import { panelClient } from "@/server/panel-client.ts";

export type SettingsStore = { slug: string; displayName: string };

export type SettingsStoreResult =
  | { status: "ok"; store: SettingsStore }
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const loadSettingsStoreFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<SettingsStoreResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const store = await client.panel.getStore({ storeSlug: data.storeSlug });

      return { status: "ok", store: { slug: store.tenantSlug, displayName: store.tenantName } };
    } catch {
      // Another store's slug and an unknown slug are both NOT_FOUND at the API.
      return { status: "not-found" };
    }
  });

export type StoreSeoResult =
  | { status: "ok"; seo: PanelStoreSeo }
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const loadStoreSeoFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<StoreSeoResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      return { status: "ok", seo: await client.panel.getStoreSeo({ storeSlug: data.storeSlug }) };
    } catch {
      return { status: "not-found" };
    }
  });
