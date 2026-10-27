/**
 * The catalog ids an order line names.
 *
 * A foreign key only proves the row exists, and a foreign key cannot say the
 * row belongs to this tenant. Without this check a checkout could name
 * another store's variation and take its stock.
 */
import type { DbTransaction } from "@menuza/db";

import { validationFailed } from "../../support.ts";

/** The catalog ids one order line names. */
export type OrderCatalogLine = {
  readonly productId?: string | null;
  readonly variationId?: string | null;
  readonly kitId?: string | null;
};

/** The product of the line, when the line names one. */
async function assertOwnedProduct(
  tx: DbTransaction,
  tenantId: string,
  line: OrderCatalogLine,
): Promise<void> {
  if (!line.productId) return;

  const product = await tx.orm.public.Product.where({ tenantId, id: line.productId }).first();

  if (!product) throw validationFailed();
}

/** The variation of the line, when the line names one. */
async function assertOwnedVariation(
  tx: DbTransaction,
  tenantId: string,
  line: OrderCatalogLine,
): Promise<void> {
  if (!line.variationId) return;

  const variation = await tx.orm.public.Variation.where({
    tenantId,
    id: line.variationId,
  }).first();

  if (!variation) throw validationFailed();

  // A variation of another product is not this line's variation.
  if (line.productId && variation.productId !== line.productId) throw validationFailed();
}

/** The kit of the line, when the line names one. */
async function assertOwnedKit(
  tx: DbTransaction,
  tenantId: string,
  line: OrderCatalogLine,
): Promise<void> {
  if (!line.kitId) return;

  const kit = await tx.orm.public.Kit.where({ tenantId, id: line.kitId }).first();

  if (!kit) throw validationFailed();
}

/**
 * Every catalog id on the order must belong to the store, and a variation
 * must belong to the product of its own line.
 */
export async function assertOwnedCatalogIds(
  tx: DbTransaction,
  tenantId: string,
  lines: readonly OrderCatalogLine[],
): Promise<void> {
  for (const line of lines) {
    await assertOwnedProduct(tx, tenantId, line);
    await assertOwnedVariation(tx, tenantId, line);
    await assertOwnedKit(tx, tenantId, line);
  }
}
