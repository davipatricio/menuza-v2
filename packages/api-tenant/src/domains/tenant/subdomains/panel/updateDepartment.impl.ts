import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.updateDepartment,
).$context<RequestHeadersHandlerPluginContext>();

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

  // `updateAll`, not `update`: RC.17 compiles `update` from `where({ tenantId, id })`
  // down to `id` only, and the isolation guard then rejects the write.
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({ tenantId: store.tenantId, id: input.departmentId }).updateAll({
      name,
      active: input.active,
    }),
  );

  return { success: true };
});

export type UpdateDepartmentImpl = typeof updateDepartmentImpl;
