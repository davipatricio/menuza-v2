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
import type { PanelProductDetail, PanelProductNutrition } from "@menuza/shared/tenant";
import { notFound } from "../session/support.ts";
import { isoOf } from "./taxonomy.ts";

/** The client and a transaction expose the same `orm` surface. */
export type CatalogTx = { readonly orm: typeof db.orm };

export function catalogConflict(message: string) {
  return new ORPCError("CONFLICT", { message, data: { code: "CONFLICT" } });
}

/** The detail loader: every field the editor renders, in one round trip. */
export function loadProduct(tx: CatalogTx, tenantId: string, productId: string) {
  return (
    tx.orm.public.Product.where({ tenantId, id: productId })
      .include("subcategory", (subcategory) =>
        subcategory
          .select("id", "name", "categoryId")
          .include("category", (category) =>
            category
              .select("id", "name")
              .include("departments", (link) =>
                link.include("department", (department) => department.select("id", "name")),
              ),
          ),
      )
      .include("tags", (productTag) => productTag.include("tag", (tag) => tag.select("id", "name")))
      .include("variations", (variation) =>
        variation
          .select("id", "name", "priceCents", "stockMode", "stockQty")
          .orderBy((v) => v.name.asc()),
      )
      // 1:1 with the product, so the label rides along in the same round trip.
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
          "notes",
          "updatedAt",
        ),
      )
      .first()
  );
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

/**
 * The 1:1 label row in the contract's shape, `null` when the product has none.
 * The two timestamps are UTC-naive columns, so they go out through `isoOf` like
 * every other `updatedAt` in the panel.
 */
function nutritionOf(product: ProductWithRelations): PanelProductNutrition | null {
  const nutrition = product.nutrition;

  if (!nutrition) return null;

  return {
    basis: nutrition.basis,
    labelFormat: nutrition.labelFormat,
    source: nutrition.source,
    referenceAt: nutrition.referenceAt === null ? null : isoOf(nutrition.referenceAt),
    energyKcal: nutrition.energyKcal,
    carbsMg: nutrition.carbsMg,
    totalSugarsMg: nutrition.totalSugarsMg,
    addedSugarsMg: nutrition.addedSugarsMg,
    proteinMg: nutrition.proteinMg,
    totalFatMg: nutrition.totalFatMg,
    saturatedFatMg: nutrition.saturatedFatMg,
    transFatMg: nutrition.transFatMg,
    fiberMg: nutrition.fiberMg,
    sodiumMg: nutrition.sodiumMg,
    portionMilli: nutrition.portionMilli,
    householdMeasure: nutrition.householdMeasure,
    servingsPerPack: nutrition.servingsPerPack,
    showHighAddedSugar: nutrition.showHighAddedSugar,
    showHighSatFat: nutrition.showHighSatFat,
    showHighSodium: nutrition.showHighSodium,
    published: nutrition.published,
    notes: nutrition.notes,
    updatedAt: isoOf(nutrition.updatedAt),
  };
}

export function toProductDetail(product: ProductWithRelations): PanelProductDetail {
  const variations = variationsOf(product);

  const subcategory = product.subcategory ?? null;
  const category = subcategory?.category ?? null;

  // The product's departments are its category's, not its own: a product sits
  // under one subcategory and the category decides where it appears.
  const departments = (category?.departments ?? [])
    .flatMap((link) => (link.department === null ? [] : [link.department]))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    subcategoryId: subcategory?.id ?? null,
    subcategoryName: subcategory?.name ?? null,
    departmentIds: departments.map((department) => department.id),
    departmentNames: departments.map((department) => department.name),
    tags: tagsOf(product),
    priceCents: priceOf(variations),
    available: product.available,
    archived: product.archived,
    hidden: product.hidden,
    private: product.private,
    sortOrder: product.sortOrder,
    updatedAt: isoOf(product.updatedAt),
    variations,
    nutrition: nutritionOf(product),
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

/**
 * Subcategory and tags must belong to the same tenant as the store.
 * `undefined` means the caller omitted the field and it is left untouched, so
 * there is nothing to check; `null` clears the relation.
 */
export async function assertOwnedIds(
  tx: CatalogTx,
  tenantId: string,
  input: {
    subcategoryId?: string | null;
    tagIds?: readonly string[];
  },
): Promise<void> {
  if (input.subcategoryId !== null && input.subcategoryId !== undefined) {
    const subcategory = await tx.orm.public.Subcategory.where({
      tenantId,
      id: input.subcategoryId,
    }).first();

    if (!subcategory) throw notFound();
  }

  for (const tagId of new Set(input.tagIds ?? [])) {
    const tag = await tx.orm.public.Tag.where({ tenantId, id: tagId }).first();

    if (!tag) throw notFound();
  }
}
