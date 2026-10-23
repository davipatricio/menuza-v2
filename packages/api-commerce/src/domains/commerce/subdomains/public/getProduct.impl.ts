/**
 * Commerce / public / getProduct implementation.
 *
 * The direct URL read. Unlike `listMenu`, it also answers hidden and archived
 * products: hidden is directly addressable by design, and archived is what lets
 * the page render "pausado temporariamente". Inactive is nonexistent.
 *
 * ponytail: `private` answers `null` because there is no storefront account
 * session to check membership against yet. Fail closed instead of leaking it.
 * Upgrade path: forward a store-member session and gate this read on membership.
 */
import { implement } from "@orpc/server";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db, withTenant } from "@menuza/db";
import { toPublicProduct } from "./support.ts";

const os = implement(commerceContractObject);

export const getProductImpl = os.public.getProduct
  .use(tenantMiddleware({ require: "optional" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    if (!tenantId) return { product: null };

    const product = await withTenant(tenantId, () =>
      db.orm.public.Product.where({ tenantId, id: input.productId })
        .include("variations", (variation) =>
          variation
            .select("id", "name", "priceCents", "stockMode", "stockQty")
            .orderBy((v) => v.name.asc()),
        )
        .include("tags", (productTag) =>
          productTag.include("tag", (tag) => tag.select("name", "isActive")),
        )
        .first(),
    );

    if (!product || !product.available || product.private) return { product: null };

    return { product: toPublicProduct(product) };
  });

export type GetProductImpl = typeof getProductImpl;
