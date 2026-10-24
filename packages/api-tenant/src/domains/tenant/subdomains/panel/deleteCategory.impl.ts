import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import { productCountOf } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.deleteCategory,
).$context<RequestHeadersHandlerPluginContext>();

/** A category with products in any of its subcategories would orphan them. */
export const deleteCategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, id: input.categoryId }).first(),
  );

  if (!existing) throw notFound();

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      const products = await productCountOf(tx, store.tenantId, [input.categoryId]);

      if (products > 0) {
        throw catalogConflict("Mova os produtos desta categoria antes de excluí-la.");
      }

      // The subcategories and department links cascade from the category.
      await tx.orm.public.Category.where({
        tenantId: store.tenantId,
        id: input.categoryId,
      }).deleteAll();
    }),
  );

  return { success: true };
});

export type DeleteCategoryImpl = typeof deleteCategoryImpl;
