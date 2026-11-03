/**
 * Server functions for the taxonomy writes behind the departments, categories,
 * subcategories, tags and badges lists.
 *
 * A write answers with a discriminated result instead of throwing: the islands
 * branch on `code` and keep the copy here, where a thrown `ApiError` would
 * only surface as a generic failure. The transport folds the API status into
 * that code, so a validation refusal arrives as `BAD_REQUEST`.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  CreateBadgeInputSchema,
  CreateCategoryInputSchema,
  CreateDepartmentInputSchema,
  CreateSubcategoryInputSchema,
  CreateTagInputSchema,
  DeleteBadgeInputSchema,
  DeleteCategoryInputSchema,
  DeleteDepartmentInputSchema,
  DeleteSubcategoryInputSchema,
  DeleteTagInputSchema,
  UpdateBadgeInputSchema,
  UpdateCategoryInputSchema,
  UpdateDepartmentInputSchema,
  UpdateSubcategoryInputSchema,
  UpdateTagInputSchema,
} from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import { panelClient } from "@/server/panel-client.ts";

/** The failure half of every write result, shared by the islands' copy maps. */
export type TaxonomyMutationFailure =
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string };

/** `data` is always `null`: the lists reload through the router after a write. */
export type TaxonomyMutationResult = { status: "ok"; data: null } | TaxonomyMutationFailure;

function failure(error: Error): TaxonomyMutationFailure {
  if (error instanceof ApiError) {
    return { status: "error", code: error.code, message: error.message };
  }

  return { status: "error", code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const updateCategoryFn = createServerFn({ method: "POST" })
  .validator(UpdateCategoryInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.updateCategory(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateSubcategoryFn = createServerFn({ method: "POST" })
  .validator(UpdateSubcategoryInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.updateSubcategory(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateDepartmentFn = createServerFn({ method: "POST" })
  .validator(UpdateDepartmentInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.updateDepartment(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateTagFn = createServerFn({ method: "POST" })
  .validator(UpdateTagInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.updateTag(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createCategoryFn = createServerFn({ method: "POST" })
  .validator(CreateCategoryInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.createCategory(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createSubcategoryFn = createServerFn({ method: "POST" })
  .validator(CreateSubcategoryInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.createSubcategory(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createDepartmentFn = createServerFn({ method: "POST" })
  .validator(CreateDepartmentInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.createDepartment(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createTagFn = createServerFn({ method: "POST" })
  .validator(CreateTagInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.createTag(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createBadgeFn = createServerFn({ method: "POST" })
  .validator(CreateBadgeInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.createBadge(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const updateBadgeFn = createServerFn({ method: "POST" })
  .validator(UpdateBadgeInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.updateBadge(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteBadgeFn = createServerFn({ method: "POST" })
  .validator(DeleteBadgeInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteBadge(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteCategoryFn = createServerFn({ method: "POST" })
  .validator(DeleteCategoryInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteCategory(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteSubcategoryFn = createServerFn({ method: "POST" })
  .validator(DeleteSubcategoryInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteSubcategory(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteDepartmentFn = createServerFn({ method: "POST" })
  .validator(DeleteDepartmentInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteDepartment(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const deleteTagFn = createServerFn({ method: "POST" })
  .validator(DeleteTagInputSchema)
  .handler(async ({ data }): Promise<TaxonomyMutationResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      await client.panel.deleteTag(data);

      return { status: "ok", data: null };
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  });
