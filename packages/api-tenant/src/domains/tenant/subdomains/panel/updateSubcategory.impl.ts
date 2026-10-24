import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.updateSubcategory,
).$context<RequestHeadersHandlerPluginContext>();

export const updateSubcategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Subcategory.where({
      tenantId: store.tenantId,
      id: input.subcategoryId,
    }).first(),
  );

  if (!existing) throw notFound();

  const category = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, id: input.categoryId }).first(),
  );

  if (!category) throw notFound();

  const name = input.name.trim();

  if (name !== existing.name || input.categoryId !== existing.categoryId) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Subcategory.where({
        tenantId: store.tenantId,
        categoryId: input.categoryId,
        name,
      }).first(),
    );

    if (duplicate && duplicate.id !== input.subcategoryId) {
      throw catalogConflict("Já existe uma subcategoria com este nome nesta categoria.");
    }
  }

  // `updateAll`, not `update`: RC.17 compiles `update` from
  // `where({ tenantId, id })` down to `id` only, and the isolation guard then
  // rejects the write.
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Subcategory.where({
      tenantId: store.tenantId,
      id: input.subcategoryId,
    }).updateAll({
      categoryId: input.categoryId,
      name,
      sortOrder: input.sortOrder,
      active: input.active,
      updatedAt: now(),
    }),
  );

  return { success: true };
});

export type UpdateSubcategoryImpl = typeof updateSubcategoryImpl;
