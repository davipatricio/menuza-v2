import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db, and } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { assertOwnedIds } from "./catalog.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.bulkUpdateProducts,
).$context<RequestHeadersHandlerPluginContext>();

type ProductBulkPatch = {
  available?: boolean;
  subcategoryId?: string | null;
  updatedAt?: Temporal.PlainDateTime;
};

/**
 * The table's bulk bar in one round trip. The selected ids are resolved inside
 * the tenant first, so a stale or foreign id is `NOT_FOUND` instead of a silent
 * partial write. Tags are merged (already-linked pairs are skipped), never
 * replaced; availability, category and department are set as given.
 */
export const bulkUpdateProductsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const productIds = [...new Set(input.productIds)];

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      const owned = await tx.orm.public.Product.where({ tenantId: store.tenantId })
        .where((product) => product.id.in(productIds))
        .select("id")
        .all();

      if (owned.length !== productIds.length) throw notFound();

      await assertOwnedIds(tx, store.tenantId, {
        subcategoryId: input.subcategoryId,
        tagIds: input.addTagIds,
      });

      const patch: ProductBulkPatch = { updatedAt: now() };

      if (input.available !== undefined) patch.available = input.available;

      if (input.subcategoryId !== undefined) patch.subcategoryId = input.subcategoryId;

      await tx.orm.public.Product.where({ tenantId: store.tenantId })
        .where((product) => product.id.in(productIds))
        .updateAll(patch);

      if (input.addTagIds !== undefined && input.addTagIds.length > 0) {
        const tagIds = [...new Set(input.addTagIds)];

        const existing = await tx.orm.public.ProductTag.where((link) =>
          and(link.tenantId.eq(store.tenantId), link.productId.in(productIds)),
        )
          .select("productId", "tagId")
          .all();

        const present = new Set(existing.map((link) => `${link.productId}:${link.tagId}`));

        const rows = productIds.flatMap((productId) => {
          const links: Array<{ tenantId: string; productId: string; tagId: string }> = [];

          for (const tagId of tagIds) {
            if (!present.has(`${productId}:${tagId}`)) {
              links.push({ tenantId: store.tenantId, productId, tagId });
            }
          }

          return links;
        });

        if (rows.length > 0) await tx.orm.public.ProductTag.createAll(rows);
      }
    }),
  );

  return { updated: productIds.length };
});

export type BulkUpdateProductsImpl = typeof bulkUpdateProductsImpl;
