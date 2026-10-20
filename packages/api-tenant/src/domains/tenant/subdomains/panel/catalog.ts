/**
 * Plumbing shared by the catalog writes.
 *
 * `getProduct`, `createProduct` and `updateProduct` all answer with the same
 * detail shape, and the two mutations re-read the row inside the tenant scope so
 * their response cannot drift from the read. The reference checks live here too:
 * a delete or a variation removal that a kit or an order still points at is a
 * `CONFLICT`, phrased once.
 */
import { ORPCError } from "@orpc/server";
import { db } from "@menuza/db";
import type { PanelProductDetail } from "@menuza/shared/tenant";
import { notFound } from "../session/support.ts";

/** The client and a transaction expose the same `orm` surface. */
export type CatalogTx = { readonly orm: typeof db.orm };

export function catalogConflict(message: string) {
  return new ORPCError("CONFLICT", { message, data: { code: "CONFLICT" } });
}

/** The detail loader: every field the editor renders, in one round trip. */
export function loadProduct(tx: CatalogTx, tenantId: string, productId: string) {
  return tx.orm.public.Product.where({ tenantId, id: productId })
    .include("category", (category) => category.select("id", "name"))
    .include("department", (department) => department.select("id", "name"))
    .include("tags", (productTag) => productTag.include("tag", (tag) => tag.select("id", "name")))
    .include("variations", (variation) =>
      variation
        .select("id", "name", "priceCents", "stockMode", "stockQty")
        .orderBy((v) => v.name.asc()),
    )
    .first();
}

export type ProductWithRelations = NonNullable<Awaited<ReturnType<typeof loadProduct>>>;

function tagsOf(product: ProductWithRelations): { id: string; name: string }[] {
  return (product.tags ?? []).flatMap((entry) =>
    entry.tag === null ? [] : [{ id: entry.tag.id, name: entry.tag.name }],
  );
}

function variationsOf(product: ProductWithRelations) {
  return (product.variations ?? []).map((variation) => ({
    id: variation.id,
    name: variation.name,
    priceCents: variation.priceCents,
    stockMode: variation.stockMode,
    stockQty: variation.stockQty,
  }));
}

/** The list's rule: the `default` variation's price, else the first one. */
function priceOf(variations: { name: string; priceCents: number }[]): number | null {
  return (
    variations.find((variation) => variation.name === "default")?.priceCents ??
    variations[0]?.priceCents ??
    null
  );
}

export function toProductDetail(product: ProductWithRelations): PanelProductDetail {
  const variations = variationsOf(product);

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    categoryId: product.category?.id ?? null,
    categoryName: product.category?.name ?? null,
    departmentId: product.department?.id ?? null,
    departmentName: product.department?.name ?? null,
    tags: tagsOf(product),
    priceCents: priceOf(variations),
    available: product.available,
    sortOrder: product.sortOrder,
    variations,
  };
}

/** Two variations with one name would trip the `(productId, name)` unique. */
export function assertUniqueVariationNames(variations: readonly { name: string }[]): void {
  const seen = new Set<string>();

  for (const variation of variations) {
    if (seen.has(variation.name)) {
      throw catalogConflict("Há variações com o mesmo nome. Use nomes diferentes.");
    }

    seen.add(variation.name);
  }
}

/** `duplicate key` covers the constraint name the contract emits. */
export function duplicateVariationName(error: Error): boolean {
  return /Variation_productId_name_key|duplicate key/i.test(error.message);
}

/** A variation a kit or an order still points at may not be removed. */
export async function variationInUse(
  tx: CatalogTx,
  tenantId: string,
  variationId: string,
): Promise<boolean> {
  const kitItem = await tx.orm.public.KitItem.where({ tenantId, variationId }).first();

  if (kitItem) return true;

  const orderItem = await tx.orm.public.OrderItem.where({ tenantId, variationId }).first();

  return orderItem !== null;
}

/** Category, department and tags must belong to the same tenant as the store. */
export async function assertOwnedIds(
  tx: CatalogTx,
  tenantId: string,
  input: { categoryId: string | null; departmentId: string | null; tagIds: string[] },
): Promise<void> {
  if (input.categoryId !== null) {
    const category = await tx.orm.public.Category.where({
      tenantId,
      id: input.categoryId,
    }).first();

    if (!category) throw notFound();
  }

  if (input.departmentId !== null) {
    const department = await tx.orm.public.Department.where({
      tenantId,
      id: input.departmentId,
    }).first();

    if (!department) throw notFound();
  }

  for (const tagId of new Set(input.tagIds)) {
    const tag = await tx.orm.public.Tag.where({ tenantId, id: tagId }).first();

    if (!tag) throw notFound();
  }
}
