import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listCategories,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's catalog categories with their product counts. Counted from the
 * products themselves so the number cannot drift from the products tab.
 */
export const listCategoriesImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const { rows: categories, allProducts: products } = await inTenantScope(
    store.tenantId,
    async () => {
      const rows = await db.orm.public.Category.where({ tenantId: store.tenantId })
        .orderBy((c) => c.sortOrder.asc())
        .all();

      const allProducts = await db.orm.public.Product.where({ tenantId: store.tenantId })
        .select("categoryId")
        .all();

      return { rows, allProducts };
    },
  );

  const counts = new Map<string, number>();

  for (const product of products) {
    if (!product.categoryId) continue;

    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
  }

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      itemsCount: counts.get(category.id) ?? 0,
    })),
  };
});

export type ListCategoriesImpl = typeof listCategoriesImpl;
