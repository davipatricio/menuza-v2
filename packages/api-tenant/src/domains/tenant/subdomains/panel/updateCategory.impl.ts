import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import { assertOwnedDepartments, now, replaceCategoryDepartments } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.updateCategory,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Full replace: the name, the order, the active flag and the department set are
 * written together. The links are swapped inside the transaction, so a failure
 * never leaves a category half-linked.
 */
export const updateCategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, id: input.categoryId }).first(),
  );

  if (!existing) throw notFound();

  const name = input.name.trim();

  if (name !== existing.name) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Category.where({ tenantId: store.tenantId, name }).first(),
    );

    if (duplicate) throw catalogConflict("Já existe uma categoria com este nome.");
  }

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      await assertOwnedDepartments(tx, store.tenantId, input.departmentIds);

      // `updateAll`, not `update`: RC.17 compiles `update` from
      // `where({ tenantId, id })` down to `id` only, and the isolation guard
      // then rejects the write.
      await tx.orm.public.Category.where({
        tenantId: store.tenantId,
        id: input.categoryId,
      }).updateAll({
        name,
        sortOrder: input.sortOrder,
        active: input.active,
        updatedAt: now(),
      });

      await replaceCategoryDepartments(tx, store.tenantId, input.categoryId, input.departmentIds);
    }),
  );

  return { success: true };
});

export type UpdateCategoryImpl = typeof updateCategoryImpl;
