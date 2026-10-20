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
  catalogConflict,
  duplicateVariationName,
  loadProduct,
  toProductDetail,
  variationInUse,
} from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.updateProduct,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The whole product is replaced in one transaction, variations included: rows
 * carrying an `id` are updated, rows without one are inserted, and the ids the
 * payload dropped are deleted. A dropped variation that an order or a kit still
 * points at is a `CONFLICT` rather than a silent cascade.
 */
export const updateProductImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    loadProduct(db, store.tenantId, input.productId),
  );

  if (!existing) throw notFound();

  const existingIds = new Set(existing.variations.map((variation) => variation.id));

  const keptIds = new Set(
    input.variations.flatMap((variation) => (variation.id === undefined ? [] : [variation.id])),
  );

  for (const id of keptIds) {
    if (!existingIds.has(id)) throw notFound();
  }

  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  const variations = input.variations.map((variation) => ({
    ...variation,
    name: variation.name.trim(),
  }));

  assertUniqueVariationNames(variations);

  try {
    await inTenantScope(store.tenantId, () =>
      db.transaction(async (tx) => {
        await assertOwnedIds(tx, store.tenantId, input);

        for (const id of removedIds) {
          if (await variationInUse(tx, store.tenantId, id)) {
            throw catalogConflict(
              "A variação faz parte de um kit ou pedido e não pode ser excluída.",
            );
          }
        }

        await tx.orm.public.Product.where({
          tenantId: store.tenantId,
          id: input.productId,
        }).update({
          name: input.name,
          description: input.description,
          categoryId: input.categoryId,
          departmentId: input.departmentId,
          available: input.available,
          sortOrder: input.sortOrder,
        });

        for (const variation of variations) {
          if (variation.id === undefined) {
            await tx.orm.public.Variation.create({
              id: randomUUID(),
              tenantId: store.tenantId,
              productId: input.productId,
              name: variation.name,
              priceCents: variation.priceCents,
              stockMode: variation.stockMode,
              stockQty: variation.stockQty,
            });

            continue;
          }

          await tx.orm.public.Variation.where({
            tenantId: store.tenantId,
            id: variation.id,
          }).update({
            name: variation.name,
            priceCents: variation.priceCents,
            stockMode: variation.stockMode,
            stockQty: variation.stockQty,
          });
        }

        for (const id of removedIds) {
          await tx.orm.public.Variation.where({ tenantId: store.tenantId, id }).delete();
        }

        await tx.orm.public.ProductTag.where({ productId: input.productId }).delete();

        for (const tagId of new Set(input.tagIds)) {
          await tx.orm.public.ProductTag.create({ productId: input.productId, tagId });
        }
      }),
    );
  } catch (error) {
    if (error instanceof Error && duplicateVariationName(error)) {
      throw catalogConflict("Já existe uma variação com este nome neste produto.");
    }

    throw error;
  }

  const product = await inTenantScope(store.tenantId, () =>
    loadProduct(db, store.tenantId, input.productId),
  );

  if (!product) throw notFound();

  return { product: toProductDetail(product) };
});

export type UpdateProductImpl = typeof updateProductImpl;
