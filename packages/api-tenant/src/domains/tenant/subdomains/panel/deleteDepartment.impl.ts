import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.deleteDepartment,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * A department still linked to a category cannot be deleted: the link would
 * disappear with it and the category would silently lose its grouping. Unlink
 * the categories first.
 */
export const deleteDepartmentImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({ tenantId: store.tenantId, id: input.departmentId }).first(),
  );

  if (!existing) throw notFound();

  const linked = await inTenantScope(store.tenantId, () =>
    db.orm.public.CategoryDepartment.where({ departmentId: input.departmentId }).first(),
  );

  if (linked) {
    throw catalogConflict("Desvincule as categorias deste departamento antes de excluí-lo.");
  }

  // `deleteAll`, not `delete`: RC.17 compiles `delete` from `where({ tenantId, id })`
  // down to `id` only, and the isolation guard then rejects the write.
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({
      tenantId: store.tenantId,
      id: input.departmentId,
    }).deleteAll(),
  );

  return { success: true };
});

export type DeleteDepartmentImpl = typeof deleteDepartmentImpl;
