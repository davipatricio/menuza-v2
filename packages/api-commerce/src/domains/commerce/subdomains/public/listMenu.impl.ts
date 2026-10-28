/**
 * Commerce / public / listMenu implementation (MEN-260).
 *
 * The buyer-facing catalog, nested department → category → subcategory →
 * product. Only active levels are published, and a group with no sellable
 * product is dropped instead of rendering an empty heading.
 *
 * A product with no variation has no price and is therefore not sellable, so it
 * is left out entirely. Public fields only: no stock quantity, no cost, no
 * customer or coupon data. A variation's `available` is derived from its stock
 * mode, never from the count itself.
 */
import { implement } from "@orpc/server";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db, withTenant } from "@menuza/db";
import { toPublicProduct } from "./support.ts";

const os = implement(commerceContractObject);

export const listMenuImpl = os.public.listMenu
  .use(tenantMiddleware({ require: "optional" }))
  .handler(async ({ context }) => {
    const tenantId = context.tenantId;

    if (!tenantId) return { departments: [], uncategorized: [] };

    const { departments, links, categories, subcategories, products } = await withTenant(
      tenantId,
      async () => ({
        departments: await db.orm.public.Department.where({ tenantId, active: true })
          .orderBy((department) => department.name.asc())
          .orderBy((department) => department.id.asc())
          .all(),
        links: await db.orm.public.CategoryDepartment.where({ tenantId }).all(),
        categories: await db.orm.public.Category.where({ tenantId, active: true })
          .orderBy((category) => category.sortOrder.asc())
          .orderBy((category) => category.name.asc())
          .all(),
        subcategories: await db.orm.public.Subcategory.where({ tenantId, active: true })
          .orderBy((subcategory) => subcategory.sortOrder.asc())
          .orderBy((subcategory) => subcategory.name.asc())
          .all(),
        products: await db.orm.public.Product.where({ tenantId })
          .include("variations", (variation) =>
            variation
              .select("id", "name", "priceCents", "stockMode", "stockQty")
              .orderBy((v) => v.name.asc()),
          )
          .include("tags", (productTag) =>
            productTag.include("tag", (tag) => tag.select("name", "isActive")),
          )
          .include("badges", (productBadge) =>
            productBadge.include("badge", (badge) =>
              badge.where({ isActive: true }).select("id", "name", "imageUrl", "sortOrder"),
            ),
          )
          .orderBy((product) => product.sortOrder.asc())
          .orderBy((product) => product.name.asc())
          .all(),
      }),
    );

    const sellable = products.flatMap((product) => {
      const variations = product.variations ?? [];

      // Inactive is nonexistent; archived, hidden and private stay out of the
      // listing (hidden is only reachable by its direct URL).
      if (!product.available || product.archived || product.hidden || product.private) return [];

      if (variations.length === 0) return [];

      return [{ subcategoryId: product.subcategoryId, menuProduct: toPublicProduct(product) }];
    });

    const productsBySubcategory = new Map<string, ReturnType<typeof toPublicProduct>[]>();

    for (const entry of sellable) {
      if (entry.subcategoryId === null) continue;

      productsBySubcategory.set(entry.subcategoryId, [
        ...(productsBySubcategory.get(entry.subcategoryId) ?? []),
        entry.menuProduct,
      ]);
    }

    const subcategoriesByCategory = new Map<
      string,
      {
        id: string;
        name: string;
        sortOrder: number;
        products: ReturnType<typeof toPublicProduct>[];
      }[]
    >();

    for (const subcategory of subcategories) {
      const items = productsBySubcategory.get(subcategory.id);

      if (items === undefined || items.length === 0) continue;

      subcategoriesByCategory.set(subcategory.categoryId, [
        ...(subcategoriesByCategory.get(subcategory.categoryId) ?? []),
        {
          id: subcategory.id,
          name: subcategory.name,
          sortOrder: subcategory.sortOrder,
          products: items,
        },
      ]);
    }

    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const departmentIdsByCategory = new Map<string, string[]>();

    for (const link of links) {
      if (!categoryById.has(link.categoryId)) continue;

      departmentIdsByCategory.set(link.categoryId, [
        ...(departmentIdsByCategory.get(link.categoryId) ?? []),
        link.departmentId,
      ]);
    }

    const categoriesByDepartment = new Map<
      string,
      {
        id: string;
        name: string;
        sortOrder: number;
        subcategories: {
          id: string;
          name: string;
          sortOrder: number;
          products: ReturnType<typeof toPublicProduct>[];
        }[];
      }[]
    >();

    for (const category of categories) {
      const subcategoryGroups = subcategoriesByCategory.get(category.id);

      if (subcategoryGroups === undefined || subcategoryGroups.length === 0) continue;

      for (const departmentId of departmentIdsByCategory.get(category.id) ?? []) {
        categoriesByDepartment.set(departmentId, [
          ...(categoriesByDepartment.get(departmentId) ?? []),
          {
            id: category.id,
            name: category.name,
            sortOrder: category.sortOrder,
            subcategories: subcategoryGroups,
          },
        ]);
      }
    }

    const publishedDepartments = departments.flatMap((department) => {
      const grouped = categoriesByDepartment.get(department.id);

      if (grouped === undefined || grouped.length === 0) return [];

      return [{ id: department.id, name: department.name, categories: grouped }];
    });

    return {
      departments: publishedDepartments,
      uncategorized: sellable
        .filter((entry) => entry.subcategoryId === null)
        .map((entry) => entry.menuProduct),
    };
  });

export type ListMenuImpl = typeof listMenuImpl;
