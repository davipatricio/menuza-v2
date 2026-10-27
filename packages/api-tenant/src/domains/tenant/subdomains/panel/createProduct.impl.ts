import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import {
  assertOwnedIds,
  assertUniqueVariationNames,
  loadProduct,
  toProductDetail,
} from "./catalog.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.createProduct,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * One transaction: the product, its variations and its tag links either all
 * land or none do. Every id in the payload is resolved inside the tenant first,
 * so a tag or a category from another store is a `NOT_FOUND`, not a link.
 */
export const createProductImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const variations = input.variations.map((variation) => ({
    ...variation,
    name: variation.name.trim(),
  }));

  assertUniqueVariationNames(variations);

  const product = await inTenantScope(store.tenantId, async () => {
    const productId = await db.transaction(async (tx) => {
      await assertOwnedIds(tx, store.tenantId, input);

      const id = randomUUID();

      await tx.orm.public.Product.create({
        id,
        tenantId: store.tenantId,
        name: input.name,
        description: input.description,
        subcategoryId: input.subcategoryId,
        available: input.available,
        archived: input.archived ?? false,
        hidden: input.hidden ?? false,
        private: input.private ?? false,
        sortOrder: input.sortOrder,
        updatedAt: now(),
      });

      for (const variation of variations) {
        await tx.orm.public.Variation.create({
          id: randomUUID(),
          tenantId: store.tenantId,
          productId: id,
          name: variation.name,
          priceCents: variation.priceCents,
          stockMode: variation.stockMode,
          stockQty: variation.stockQty,
        });
      }

      for (const tagId of new Set(input.tagIds)) {
        await tx.orm.public.ProductTag.create({ tenantId: store.tenantId, productId: id, tagId });
      }

      return id;
    });

    return loadProduct(db, store.tenantId, productId);
  });

  if (!product) throw notFound();

  return { product: toProductDetail(product) };
});

export type CreateProductImpl = typeof createProductImpl;
