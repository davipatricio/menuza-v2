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

/** A department still attached to a product would be orphaned by the delete. */
export const deleteDepartmentImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({ tenantId: store.tenantId, id: input.departmentId }).first(),
  );

  if (!existing) throw notFound();

  const product = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({
      tenantId: store.tenantId,
      departmentId: input.departmentId,
    }).first(),
  );

  if (product) throw catalogConflict("Mova os produtos deste departamento antes de excluí-lo.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({ tenantId: store.tenantId, id: input.departmentId }).delete(),
  );

  return { success: true };
});

export type DeleteDepartmentImpl = typeof deleteDepartmentImpl;
