import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.deleteSubcategory,
).$context<RequestHeadersHandlerPluginContext>();

/** A subcategory still holding products would orphan them. */
export const deleteSubcategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Subcategory.where({
      tenantId: store.tenantId,
      id: input.subcategoryId,
    }).first(),
  );

  if (!existing) throw notFound();

  const product = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({
      tenantId: store.tenantId,
      subcategoryId: input.subcategoryId,
    }).first(),
  );

  if (product) {
    throw catalogConflict(
      "Esta subcategoria ainda tem produtos. Mova os produtos antes de excluí-la.",
    );
  }

  // `deleteAll`, not `delete`: RC.17 compiles `delete` from
  // `where({ tenantId, id })` down to `id` only, and the isolation guard then
  // rejects the write.
  await inTenantScope(store.tenantId, () =>
    db.orm.public.Subcategory.where({
      tenantId: store.tenantId,
      id: input.subcategoryId,
    }).deleteAll(),
  );

  return { success: true };
});

export type DeleteSubcategoryImpl = typeof deleteSubcategoryImpl;
