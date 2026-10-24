import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.createSubcategory,
).$context<RequestHeadersHandlerPluginContext>();

export const createSubcategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const category = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, id: input.categoryId }).first(),
  );

  if (!category) throw notFound();

  const name = input.name.trim();

  const duplicate = await inTenantScope(store.tenantId, () =>
    db.orm.public.Subcategory.where({
      tenantId: store.tenantId,
      categoryId: input.categoryId,
      name,
    }).first(),
  );

  if (duplicate) throw catalogConflict("Já existe uma subcategoria com este nome nesta categoria.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Subcategory.create({
      id: randomUUID(),
      tenantId: store.tenantId,
      categoryId: input.categoryId,
      name,
      sortOrder: input.sortOrder,
      active: input.active,
      updatedAt: now(),
    }),
  );

  return { success: true };
});

export type CreateSubcategoryImpl = typeof createSubcategoryImpl;
