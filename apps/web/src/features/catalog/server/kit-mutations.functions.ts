/**
 * Writes for the kit editor.
 *
 * The payload is already shaped by `kitPayload()` and validated by
 * `validateKit()` against the same rules the Rust contract applies, so the
 * server function forwards it as is: a second Valibot copy would drift, and the
 * API is the authority anyway. Failures come back as a discriminated result so
 * the editor can keep the pt-BR copy next to the form.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { ApiError } from "@/lib/api-error";
import type { PanelKitDetail } from "@/lib/api/model/panelKitDetail.ts";
import { panelClient } from "@/server/panel-client.ts";
import { createKitInputSchema, updateKitInputSchema } from "../schemas/kit.ts";

export type KitMutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

export type KitMutationResult = { status: "ok"; data: PanelKitDetail } | KitMutationFailure;

export type KitDeleteResult = { status: "ok"; data: null } | KitMutationFailure;

/**
 * The transport shape, checked by the same schema the editor uses. The business
 * rules stay in `validateKit()`; this only guarantees the contract's fields.
 */
const deleteKitPayload = v.object({ storeSlug: v.string(), kitId: v.string() });

function failure(error: Error): KitMutationFailure {
  if (error instanceof ApiError)
    return { status: "error", code: error.code, message: error.message };

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const createKitFn = createServerFn({ method: "POST" })
  .validator(createKitInputSchema)
  .handler(async ({ data }): Promise<KitMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { kit } = await client.panel.createKit(data);

      return { status: "ok", data: kit };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateKitFn = createServerFn({ method: "POST" })
  .validator(updateKitInputSchema)
  .handler(async ({ data }): Promise<KitMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { kit } = await client.panel.updateKit(data);

      return { status: "ok", data: kit };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteKitFn = createServerFn({ method: "POST" })
  .validator(deleteKitPayload)
  .handler(async ({ data }): Promise<KitDeleteResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteKit(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

/**
 * The row switch in the kit list. It sends only the two flags, which the
 * contract treats as a patch: every other field keeps its stored value.
 */
export const setKitAvailableFn = createServerFn({ method: "POST" })
  .validator(
    v.object({
      storeSlug: v.string(),
      kitId: v.string(),
      available: v.optional(v.boolean()),
      archived: v.optional(v.boolean()),
    }),
  )
  .handler(async ({ data }): Promise<KitMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { kit } = await client.panel.setKitAvailable(data);

      return { status: "ok", data: kit };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });
