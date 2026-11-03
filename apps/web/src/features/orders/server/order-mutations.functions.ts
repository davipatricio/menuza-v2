/**
 * Server functions for the order detail's action buttons.
 *
 * A move answers with a discriminated result instead of throwing: the island
 * branches on `code` and keeps the copy here, where a thrown `ApiError` would
 * only surface as a generic failure. The axis, the target and the reason come
 * straight from `@menuza/shared/tenant`, so the button and the API agree.
 */
import { createServerFn } from "@tanstack/react-start";
import { PanelOrderIdInputSchema, PanelOrderTransitionInputSchema } from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import { panelClient } from "@/server/panel-client.ts";

/** The failure half of both writes, shared by the island's copy map. */
export type OrderMutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

/** `null` on success: the island re-runs the loader for the new state. */
export type OrderMutationResult = { status: "ok"; data: null } | OrderMutationFailure;

function failure(error: Error): OrderMutationFailure {
  if (error instanceof ApiError) {
    return { status: "error", code: error.code, message: error.message };
  }

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const transitionOrderFn = createServerFn({ method: "POST" })
  .validator(PanelOrderTransitionInputSchema)
  .handler(async ({ data }): Promise<OrderMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.transitionOrder(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const recordOrderPaymentFn = createServerFn({ method: "POST" })
  .validator(PanelOrderIdInputSchema)
  .handler(async ({ data }): Promise<OrderMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.recordOrderPayment(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });
