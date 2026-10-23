import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict, variationInUse } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.deleteProduct,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Deleting cascades the variations and the tag links, so the only thing to
 * refuse is a product an order line or a kit still points at. The check and the
 * delete share one transaction.
 */
export const deleteProductImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({ tenantId: store.tenantId, id: input.productId }).first(),
  );

  if (!existing) throw notFound();

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      const orderItem = await tx.orm.public.OrderItem.where({
        tenantId: store.tenantId,
        productId: input.productId,
      }).first();

      if (orderItem) {
        throw catalogConflict(
          "Este produto faz parte de um pedido ou kit e não pode ser excluído.",
        );
      }

      const variations = await tx.orm.public.Variation.where({
        tenantId: store.tenantId,
        productId: input.productId,
      }).all();

      for (const variation of variations) {
        if (await variationInUse(tx, store.tenantId, variation.id)) {
          throw catalogConflict(
            "Este produto faz parte de um pedido ou kit e não pode ser excluído.",
          );
        }
      }

      // `delete` drops the non-unique tenantId predicate in Prisma 8 RC.17;
      // `deleteAll` keeps it and still deletes the single row.
      await tx.orm.public.Product.where({
        tenantId: store.tenantId,
        id: input.productId,
      }).deleteAll();
    }),
  );

  return { success: true };
});

export type DeleteProductImpl = typeof deleteProductImpl;
