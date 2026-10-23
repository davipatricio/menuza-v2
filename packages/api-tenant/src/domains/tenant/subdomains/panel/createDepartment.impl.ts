import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.createDepartment,
).$context<RequestHeadersHandlerPluginContext>();

export const createDepartmentImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const name = input.name.trim();

  const duplicate = await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.where({ tenantId: store.tenantId, name }).first(),
  );

  if (duplicate) throw catalogConflict("Já existe um departamento com este nome.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Department.create({
      id: randomUUID(),
      tenantId: store.tenantId,
      name,
      active: input.active,
    }),
  );

  return { success: true };
});

export type CreateDepartmentImpl = typeof createDepartmentImpl;
