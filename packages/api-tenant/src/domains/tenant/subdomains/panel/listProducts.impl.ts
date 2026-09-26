import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listProducts,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's catalog. The price shown is the `default` variation's: money
 * lives on the Variation, not on the Product (MEN-80), and a real variant
 * matrix needs a variation picker that this panel does not have yet.
 */
export const listProductsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const products = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({ tenantId: store.tenantId })
      .include("category", (category) => category.select("id", "name"))
      .include("variations", (variation) =>
        variation.select("name", "priceCents").orderBy((v) => v.name.asc()),
      )
      .orderBy((p) => p.sortOrder.asc())
      .all(),
  );

  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      priceCents:
        product.variations.find((variation) => variation.name === "default")?.priceCents ??
        product.variations[0]?.priceCents ??
        null,
      available: product.available,
    })),
  };
});

export type ListProductsImpl = typeof listProductsImpl;
