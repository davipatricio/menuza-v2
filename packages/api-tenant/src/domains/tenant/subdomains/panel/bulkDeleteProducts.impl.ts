import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { variationInUse } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.bulkDeleteProducts,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Deletes the selection, but skips the products an order or a kit still points
 * at. The caller gets the skipped rows by name so the table can explain the
 * partial result instead of failing the whole batch.
 */
export const bulkDeleteProductsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const productIds = [...new Set(input.productIds)];

  const products = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({ tenantId: store.tenantId })
      .where((product) => product.id.in(productIds))
      .select("id", "name")
      .all(),
  );

  if (products.length === 0) return { deleted: 0, skipped: [] };

  const skipped: Array<{ id: string; name: string }> = [];
  const deletable: string[] = [];

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      for (const product of products) {
        const orderItem = await tx.orm.public.OrderItem.where({
          tenantId: store.tenantId,
          productId: product.id,
        }).first();

        if (orderItem) {
          skipped.push({ id: product.id, name: product.name });
          continue;
        }

        const variations = await tx.orm.public.Variation.where({
          tenantId: store.tenantId,
          productId: product.id,
        })
          .select("id")
          .all();

        let inUse = false;

        for (const variation of variations) {
          if (await variationInUse(tx, store.tenantId, variation.id)) {
            inUse = true;
            break;
          }
        }

        if (inUse) {
          skipped.push({ id: product.id, name: product.name });
          continue;
        }

        deletable.push(product.id);
      }

      if (deletable.length > 0) {
        await tx.orm.public.Product.where({ tenantId: store.tenantId })
          .where((product) => product.id.in(deletable))
          .deleteAll();
      }
    }),
  );

  return { deleted: deletable.length, skipped };
});

export type BulkDeleteProductsImpl = typeof bulkDeleteProductsImpl;
