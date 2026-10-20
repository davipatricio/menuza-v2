import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.createCategory,
).$context<RequestHeadersHandlerPluginContext>();

export const createCategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const name = input.name.trim();

  const duplicate = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, name }).first(),
  );

  if (duplicate) throw catalogConflict("Já existe uma categoria com este nome.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.create({
      id: randomUUID(),
      tenantId: store.tenantId,
      name,
      sortOrder: input.sortOrder,
    }),
  );

  return { success: true };
});

export type CreateCategoryImpl = typeof createCategoryImpl;
