import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.deleteCategory,
).$context<RequestHeadersHandlerPluginContext>();

/** A category still attached to a product would be orphaned by the delete. */
export const deleteCategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, id: input.categoryId }).first(),
  );

  if (!existing) throw notFound();

  const product = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({ tenantId: store.tenantId, categoryId: input.categoryId }).first(),
  );

  if (product) throw catalogConflict("Mova os produtos desta categoria antes de excluí-la.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, id: input.categoryId }).delete(),
  );

  return { success: true };
});

export type DeleteCategoryImpl = typeof deleteCategoryImpl;
