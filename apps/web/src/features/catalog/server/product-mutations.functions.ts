/**
 * Server functions for the catalog writes behind the product editor, the
 * products list and the nutrition tab.
 *
 * A write answers with a discriminated result instead of throwing: the islands
 * branch on `code` and keep the copy here, where a thrown `ApiError` would
 * only surface as a generic failure. Read the addressing from
 * `@menuza/shared/tenant` so the form and the API agree on one schema.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import {
  CreateProductInputSchema,
  DeleteProductInputSchema,
  SaveProductNutritionInputSchema,
  UpdateProductInputSchema,
  type PanelProductDetail,
} from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import { panelClient } from "@/server/panel-client.ts";

/** The failure half of every write result, shared by the islands' copy maps. */
export type MutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

export type ProductMutationResult = { status: "ok"; data: PanelProductDetail } | MutationFailure;

/** `null` on success: the editor only needs to know the delete went through. */
export type ProductDeleteResult = { status: "ok"; data: null } | MutationFailure;

export type BulkUpdateResult = { status: "ok"; data: { updated: number } } | MutationFailure;

export type BulkDeleteResult =
  | { status: "ok"; data: { deleted: number; skipped: { id: string; name: string }[] } }
  | MutationFailure;

/**
 * The two bulk procedures take no exported input schema, so the transport
 * fields are declared here; the API still validates the whole payload.
 */
const bulkUpdateProductsSchema = v.object({
  storeSlug: v.string(),
  productIds: v.array(v.string()),
  available: v.optional(v.boolean()),
  addTagIds: v.optional(v.array(v.string())),
  subcategoryId: v.optional(v.nullable(v.string())),
});

const bulkDeleteProductsSchema = v.object({
  storeSlug: v.string(),
  productIds: v.array(v.string()),
});

function failure(error: Error): MutationFailure {
  if (error instanceof ApiError) {
    return { status: "error", code: error.code, message: error.message };
  }

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const createProductFn = createServerFn({ method: "POST" })
  .validator(CreateProductInputSchema)
  .handler(async ({ data }): Promise<ProductMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { product } = await client.panel.createProduct(data);

      return { status: "ok", data: product };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateProductFn = createServerFn({ method: "POST" })
  .validator(UpdateProductInputSchema)
  .handler(async ({ data }): Promise<ProductMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { product } = await client.panel.updateProduct(data);

      return { status: "ok", data: product };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteProductFn = createServerFn({ method: "POST" })
  .validator(DeleteProductInputSchema)
  .handler(async ({ data }): Promise<ProductDeleteResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteProduct(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const saveProductNutritionFn = createServerFn({ method: "POST" })
  .validator(SaveProductNutritionInputSchema)
  .handler(async ({ data }): Promise<ProductMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { product } = await client.panel.saveProductNutrition(data);

      return { status: "ok", data: product };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const bulkUpdateProductsFn = createServerFn({ method: "POST" })
  .validator(bulkUpdateProductsSchema)
  .handler(async ({ data }): Promise<BulkUpdateResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { updated } = await client.panel.bulkUpdateProducts(data);

      return { status: "ok", data: { updated } };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const bulkDeleteProductsFn = createServerFn({ method: "POST" })
  .validator(bulkDeleteProductsSchema)
  .handler(async ({ data }): Promise<BulkDeleteResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { deleted, skipped } = await client.panel.bulkDeleteProducts(data);

      return { status: "ok", data: { deleted, skipped } };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });
