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

/** The scalar columns an update may touch; an omitted key is left alone. */
type ProductScalarPatch = {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  departmentId?: string | null;
  available?: boolean;
  archived?: boolean;
  hidden?: boolean;
  private?: boolean;
  sortOrder?: number;
};

/**
 * Partial update: a key present in the payload is written, an omitted one is
 * left exactly as it is. Variations and tags are replaced as a set only when the
 * payload carries them: rows with an `id` are updated, rows without one are
 * inserted, and the ids the array dropped are deleted. A dropped variation that
 * an order or a kit still points at is a `CONFLICT` rather than a silent cascade.
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
    (input.variations ?? []).flatMap((variation) =>
      variation.id === undefined ? [] : [variation.id],
    ),
  );

  for (const id of keptIds) {
    if (!existingIds.has(id)) throw notFound();
  }

  const removedIds =
    input.variations === undefined ? [] : [...existingIds].filter((id) => !keptIds.has(id));

  const variations = (input.variations ?? []).map((variation) => ({
    ...variation,
    name: variation.name.trim(),
  }));

  assertUniqueVariationNames(variations);

  // Only the keys the caller actually sent: an omitted field is left alone.
  const patch: ProductScalarPatch = {};

  if (input.name !== undefined) patch.name = input.name;

  if (input.description !== undefined) patch.description = input.description;

  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;

  if (input.departmentId !== undefined) patch.departmentId = input.departmentId;

  if (input.available !== undefined) patch.available = input.available;

  if (input.archived !== undefined) patch.archived = input.archived;

  if (input.hidden !== undefined) patch.hidden = input.hidden;

  if (input.private !== undefined) patch.private = input.private;

  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  try {
    await inTenantScope(store.tenantId, () =>
      db.transaction(async (tx) => {
        await assertOwnedIds(tx, store.tenantId, input);

        if (Object.keys(patch).length > 0) {
          // `update` drops every non-unique predicate from the WHERE in Prisma 8
          // RC.17 (it keeps only `id`), which trips the tenant-isolation guard.
          // `updateAll` keeps the full filter and still targets the one row.
          await tx.orm.public.Product.where({
            tenantId: store.tenantId,
            id: input.productId,
          }).updateAll(patch);
        }

        if (input.variations !== undefined) {
          for (const id of removedIds) {
            if (await variationInUse(tx, store.tenantId, id)) {
              throw catalogConflict(
                "A variação faz parte de um kit ou pedido e não pode ser excluída.",
              );
            }
          }

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
            }).updateAll({
              name: variation.name,
              priceCents: variation.priceCents,
              stockMode: variation.stockMode,
              stockQty: variation.stockQty,
            });
          }

          for (const id of removedIds) {
            await tx.orm.public.Variation.where({ tenantId: store.tenantId, id }).deleteAll();
          }
        }

        if (input.tagIds !== undefined) {
          await tx.orm.public.ProductTag.where({ productId: input.productId }).delete();

          for (const tagId of new Set(input.tagIds)) {
            await tx.orm.public.ProductTag.create({ productId: input.productId, tagId });
          }
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
