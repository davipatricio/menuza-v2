import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { badgesOf } from "./catalog.ts";
import { inTenantScope, resolveStore } from "./support.ts";
import { isoOf } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.listProducts,
).$context<RequestHeadersHandlerPluginContext>();

/** Nulls sort last in both directions; they mean "no value". */
function compareNullableNumbers(a: number | null, b: number | null, direction: number): number {
  if (a === null) return b === null ? 0 : 1;

  if (b === null) return -1;

  return direction * (a - b);
}

function compareNullableText(a: string | null, b: string | null, direction: number): number {
  if (a === null) return b === null ? 0 : 1;

  if (b === null) return -1;

  return direction * a.localeCompare(b, "pt-BR");
}

/**
 * The store's catalog. The price shown is the `default` variation's: money
 * lives on the Variation, not on the Product (MEN-80), and a real variant
 * matrix needs a variation picker that this panel does not have yet.
 *
 * Grouping is resolved in three flat reads — subcategories with their category,
 * the category/department links, and the departments — instead of a deep
 * include per row.
 */
export const listProductsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const direction = input.order === "desc" ? "desc" : "asc";

  const { products, subcategories, categories, links, departments } = await inTenantScope(
    store.tenantId,
    async () => {
      const base = db.orm.public.Product.where({ tenantId: store.tenantId })
        .include("tags", (productTag) =>
          productTag.include("tag", (tag) => tag.select("id", "name")),
        )
        .include("badges", (productBadge) =>
          productBadge.include("badge", (badge) => badge.select("id", "name", "imageUrl")),
        )
        .include("variations", (variation) =>
          variation
            .select("name", "priceCents", "stockMode", "stockQty")
            .orderBy((v) => v.name.asc()),
        );

      // Price, category and stock are computed from joined rows, so those keep
      // the stable `sortOrder` base and are ordered after the mapping below.
      const ordered =
        input.sortBy === "name"
          ? direction === "desc"
            ? base.orderBy((p) => p.name.desc())
            : base.orderBy((p) => p.name.asc())
          : input.sortBy === "updatedAt"
            ? direction === "desc"
              ? base.orderBy((p) => p.updatedAt.desc())
              : base.orderBy((p) => p.updatedAt.asc())
            : input.sortBy === "price" || input.sortBy === "category" || input.sortBy === "stock"
              ? base.orderBy((p) => p.sortOrder.asc())
              : direction === "desc"
                ? base.orderBy((p) => p.sortOrder.desc())
                : base.orderBy((p) => p.sortOrder.asc());

      return {
        products: await ordered.orderBy((p) => p.id.asc()).all(),
        subcategories: await db.orm.public.Subcategory.where({ tenantId: store.tenantId })
          .select("id", "name", "categoryId")
          .all(),
        categories: await db.orm.public.Category.where({ tenantId: store.tenantId })
          .select("id", "name")
          .all(),
        links: await db.orm.public.CategoryDepartment.where({ tenantId: store.tenantId }).all(),
        departments: await db.orm.public.Department.where({ tenantId: store.tenantId })
          .select("id", "name")
          .all(),
      };
    },
  );

  const departmentNameById = new Map(
    departments.map((department) => [department.id, department.name]),
  );

  const departmentIdsByCategory = new Map<string, string[]>();

  for (const link of links) {
    if (!departmentNameById.has(link.departmentId)) continue;

    departmentIdsByCategory.set(link.categoryId, [
      ...(departmentIdsByCategory.get(link.categoryId) ?? []),
      link.departmentId,
    ]);
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const subcategoryById = new Map(
    subcategories.map((subcategory) => [subcategory.id, subcategory]),
  );

  const seoRows = await inTenantScope(store.tenantId, () =>
    db.orm.public.SeoMeta.where({ tenantId: store.tenantId, entityType: "product" })
      .select("entityId", "title", "description")
      .all(),
  );

  const seoByProduct = new Map(seoRows.map((row) => [row.entityId, row]));

  const rows = products.map((product) => {
    const prices = product.variations.map((variation) => variation.priceCents);
    const seo = seoByProduct.get(product.id);

    const controlled = product.variations.filter(
      (variation) => variation.stockMode === "controlled",
    );

    const subcategory =
      product.subcategoryId === null ? null : (subcategoryById.get(product.subcategoryId) ?? null);

    const category =
      subcategory === null ? null : (categoryById.get(subcategory.categoryId) ?? null);

    const departmentIds =
      category === null
        ? []
        : [...(departmentIdsByCategory.get(category.id) ?? [])].sort(
            (a, b) =>
              (departmentNameById.get(a) ?? "").localeCompare(
                departmentNameById.get(b) ?? "",
                "pt-BR",
              ) || a.localeCompare(b),
          );

    return {
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      seoTitle: seo?.title ?? null,
      seoDescription: seo?.description ?? null,
      variationNames: product.variations.map((variation) => variation.name),
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      subcategoryId: subcategory?.id ?? null,
      subcategoryName: subcategory?.name ?? null,
      departmentIds,
      departmentNames: departmentIds.map(
        (departmentId) => departmentNameById.get(departmentId) ?? "",
      ),
      tags: (product.tags ?? [])
        .map((entry: { tag: { id: string; name: string } | null; tagId: string }) => {
          const tag = entry.tag;

          if (!tag) return null;

          return { id: tag.id, name: tag.name };
        })
        .filter((entry): entry is { id: string; name: string } => entry !== null),
      badges: badgesOf(product.badges),
      priceCents:
        product.variations.find((variation) => variation.name === "default")?.priceCents ??
        product.variations[0]?.priceCents ??
        null,
      priceMinCents: prices.length > 0 ? Math.min(...prices) : null,
      priceMaxCents: prices.length > 0 ? Math.max(...prices) : null,
      variationCount: product.variations.length,
      stockQty:
        controlled.length > 0
          ? controlled.reduce((total, variation) => total + (variation.stockQty ?? 0), 0)
          : null,
      hasUnlimitedStock: product.variations.some(
        (variation) => variation.stockMode === "unlimited",
      ),
      available: product.available,
      archived: product.archived,
      hidden: product.hidden,
      private: product.private,
      sortOrder: product.sortOrder,
      updatedAt: isoOf(product.updatedAt),
    };
  });

  const orient = input.order === "desc" ? -1 : 1;

  if (input.sortBy === "price") {
    rows.sort(
      (a, b) =>
        compareNullableNumbers(a.priceMinCents, b.priceMinCents, orient) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  }

  if (input.sortBy === "category") {
    rows.sort(
      (a, b) =>
        compareNullableText(a.categoryName, b.categoryName, orient) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  }

  if (input.sortBy === "stock") {
    rows.sort(
      (a, b) =>
        compareNullableNumbers(a.stockQty, b.stockQty, orient) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  }

  return { products: rows };
});

export type ListProductsImpl = typeof listProductsImpl;
