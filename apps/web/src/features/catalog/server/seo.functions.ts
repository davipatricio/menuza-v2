/**
 * Server functions for the SEO writes: the store-level templates and the
 * per-entity override.
 *
 * Same shape as the taxonomy writes: a discriminated result instead of a throw,
 * so the islands map `code` to pt-BR copy. Every write answers with the freshly
 * resolved SEO, which is what re-labels a field as inherited after a revert.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  PanelSeoInputSchema,
  SaveSeoInputSchema,
  SaveStoreSeoSettingsInputSchema,
  type PanelSeo,
  type PanelStoreSeo,
} from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import { panelClient } from "@/server/panel-client.ts";

/** The failure half of every SEO write result, shared by the island's copy map. */
export type SeoMutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

export type SeoMutationResult = { status: "ok"; data: PanelSeo } | SeoMutationFailure;

export type StoreSeoMutationResult = { status: "ok"; data: PanelStoreSeo } | SeoMutationFailure;

function failure(error: Error): SeoMutationFailure {
  if (error instanceof ApiError) {
    return { status: "error", code: error.code, message: error.message };
  }

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const saveStoreSeoFn = createServerFn({ method: "POST" })
  .validator(SaveStoreSeoSettingsInputSchema)
  .handler(async ({ data }): Promise<StoreSeoMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      return { status: "ok", data: await client.panel.saveStoreSeo(data) };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const saveSeoFn = createServerFn({ method: "POST" })
  .validator(SaveSeoInputSchema)
  .handler(async ({ data }): Promise<SeoMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      return { status: "ok", data: await client.panel.saveSeo(data) };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const revertSeoFn = createServerFn({ method: "POST" })
  .validator(PanelSeoInputSchema)
  .handler(async ({ data }): Promise<SeoMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      return { status: "ok", data: await client.panel.revertSeo(data) };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });
