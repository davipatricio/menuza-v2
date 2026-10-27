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
import { loadResolvedSeo, loadTenant, toPublicProductDetail } from "./support.ts";

const os = implement(commerceContractObject);

export const getProductImpl = os.public.getProduct
  .use(tenantMiddleware({ require: "optional" }))
  .handler(async ({ input, context }) => {
    const tenantId = context.tenantId;

    if (!tenantId) return { product: null };

    const [tenant, product] = await Promise.all([
      loadTenant(tenantId),
      withTenant(tenantId, () =>
        db.orm.public.Product.where({ tenantId, id: input.productId })
          .include("variations", (variation) =>
            variation
              .select("id", "name", "priceCents", "stockMode", "stockQty")
              .orderBy((v) => v.name.asc()),
          )
          .include("tags", (productTag) =>
            productTag.include("tag", (tag) => tag.select("name", "isActive")),
          )
          // The 1:1 label; `toPublicNutrition` is what decides whether it ships.
          .include("nutrition", (nutrition) =>
            nutrition.select(
              "basis",
              "labelFormat",
              "source",
              "referenceAt",
              "energyKcal",
              "carbsMg",
              "totalSugarsMg",
              "addedSugarsMg",
              "proteinMg",
              "totalFatMg",
              "saturatedFatMg",
              "transFatMg",
              "fiberMg",
              "sodiumMg",
              "portionMilli",
              "householdMeasure",
              "servingsPerPack",
              "showHighAddedSugar",
              "showHighSatFat",
              "showHighSodium",
              "published",
              "updatedAt",
            ),
          )
          .first(),
      ),
    ]);

    if (!product || !product.available || product.private) return { product: null };

    // The product's own SEO: the override the panel edits, the store's row and
    // the store templates behind it.
    const seo = await loadResolvedSeo({
      tenantId,
      storeName: tenant?.displayName ?? "",
      entityType: "product",
      entityId: product.id,
      entityName: product.name,
      fallbackTitle: product.name,
      fallbackDescription: product.description,
    });

    return { product: toPublicProductDetail(product, product.nutrition, seo) };
  });

export type GetProductImpl = typeof getProductImpl;
