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
import type { PanelTheme } from "@menuza/api-client/model/panelTheme";
import { ApiError } from "@/lib/api-error.ts";
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

export type StoreSeoCoverage = { total: number; withOverride: number };

export type StoreSeoResult =
  | { status: "ok"; seo: PanelStoreSeo; coverage: StoreSeoCoverage }
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const loadStoreSeoFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<StoreSeoResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const [seo, list] = await Promise.all([
        client.panel.getStoreSeo({ storeSlug: data.storeSlug }),
        client.panel.listSeoEntities({ storeSlug: data.storeSlug }),
      ]);

      return {
        status: "ok",
        seo,
        coverage: {
          total: list.entities.length,
          withOverride: list.entities.filter((entity) => entity.hasOverride).length,
        },
      };
    } catch {
      return { status: "not-found" };
    }
  });

export type StoreThemeResult =
  | { status: "ok"; theme: PanelTheme }
  | { status: "unauthenticated" }
  | { status: "not-found" };

export type StoreThemeMutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

export type StoreThemeMutationResult =
  | { status: "ok"; theme: PanelTheme }
  | StoreThemeMutationFailure;

/** `#rrggbb` is the one color shape the API accepts; the browser color input emits it. */
const hexColor = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));

const SaveThemeSchema = v.object({
  storeSlug: v.string(),
  primaryColor: hexColor,
  accentColor: hexColor,
  backgroundColor: hexColor,
  radius: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(32)),
});

export const loadStoreThemeFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<StoreThemeResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      return {
        status: "ok",
        theme: await client.panel.getStoreTheme({ storeSlug: data.storeSlug }),
      };
    } catch {
      return { status: "not-found" };
    }
  });

function themeFailure(error: Error): StoreThemeMutationFailure {
  if (error instanceof ApiError) {
    return { status: "error", code: error.code, message: error.message };
  }

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const saveStoreThemeFn = createServerFn({ method: "POST" })
  .validator(SaveThemeSchema)
  .handler(async ({ data }): Promise<StoreThemeMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      return { status: "ok", theme: await client.panel.saveStoreTheme(data) };
    } catch (error) {
      return themeFailure(error instanceof Error ? error : new Error(String(error)));
    }
  });
