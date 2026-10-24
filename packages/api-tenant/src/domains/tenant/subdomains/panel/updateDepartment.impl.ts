import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import { departmentProductCount, moveProductsToCategory, now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.updateDepartment,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Renames a department and flips its active flag. Deactivating one that still
 * has products requires a destination category: the products move to that
 * category's `Geral` subcategory inside the same transaction, so the storefront
 * never lists an inactive department's items.
 */
export const updateDepartmentImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({ tenantId: store.tenantId, id: input.departmentId }).first(),
  );

  if (!existing) throw notFound();

  const name = input.name.trim();

  if (name !== existing.name) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Department.where({ tenantId: store.tenantId, name }).first(),
    );

    if (duplicate) throw catalogConflict("Já existe um departamento com este nome.");
  }

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      if (!input.active) {
        const count = await departmentProductCount(tx, store.tenantId, input.departmentId);

        if (count > 0) {
          const targetId = input.moveProductsToCategoryId;

          if (targetId === null || targetId === undefined) {
            throw catalogConflict(
              `Este departamento tem ${count} produtos. Escolha uma categoria de destino para movê-los.`,
            );
          }

          const target = await tx.orm.public.Category.where({
            tenantId: store.tenantId,
            id: targetId,
          }).first();

          if (!target) throw catalogConflict("Categoria de destino não encontrada.");

          const linked = await tx.orm.public.CategoryDepartment.where({
            categoryId: targetId,
            departmentId: input.departmentId,
          }).first();

          if (linked) {
            throw catalogConflict("Escolha uma categoria que não pertença a este departamento.");
          }

          await moveProductsToCategory(tx, store.tenantId, input.departmentId, targetId);
        }
      }

      // `updateAll`, not `update`: RC.17 compiles `update` from
      // `where({ tenantId, id })` down to `id` only, and the isolation guard
      // then rejects the write.
      await tx.orm.public.Department.where({
        tenantId: store.tenantId,
        id: input.departmentId,
      }).updateAll({
        name,
        active: input.active,
        updatedAt: now(),
      });
    }),
  );

  return { success: true };
});

export type UpdateDepartmentImpl = typeof updateDepartmentImpl;
