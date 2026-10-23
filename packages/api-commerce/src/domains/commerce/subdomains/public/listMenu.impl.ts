/**
 * Commerce / public / listMenu implementation (MEN-260).
 *
 * The buyer-facing catalog: categories in display order, products inside them,
 * uncategorized products last. A product with no variation has no price and is
 * therefore not sellable, so it is left out entirely.
 *
 * Public fields only: no stock quantity, no cost, no customer or coupon data.
 * A variation's `available` is derived from its stock mode, never from the
 * count itself.
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

    if (!tenantId) return { categories: [], uncategorized: [] };

    const { categories, products } = await withTenant(tenantId, async () => {
      const rows = await db.orm.public.Category.where({ tenantId })
        .orderBy((category) => category.sortOrder.asc())
        .orderBy((category) => category.name.asc())
        .all();

      const catalog = await db.orm.public.Product.where({ tenantId })
        .include("variations", (variation) =>
          variation
            .select("id", "name", "priceCents", "stockMode", "stockQty")
            .orderBy((v) => v.name.asc()),
        )
        .include("tags", (productTag) =>
          productTag.include("tag", (tag) => tag.select("name", "isActive")),
        )
        .orderBy((product) => product.sortOrder.asc())
        .orderBy((product) => product.name.asc())
        .all();

      return { categories: rows, products: catalog };
    });

    const sellable = products.flatMap((product) => {
      const variations = product.variations ?? [];

      // Inactive is nonexistent; archived, hidden and private stay out of the
      // listing (hidden is only reachable by its direct URL).
      if (!product.available || product.archived || product.hidden || product.private) return [];

      if (variations.length === 0) return [];

      return [
        {
          categoryId: product.categoryId,
          menuProduct: toPublicProduct(product),
        },
      ];
    });

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        products: sellable
          .filter((entry) => entry.categoryId === category.id)
          .map((entry) => entry.menuProduct),
      })),
      uncategorized: sellable
        .filter((entry) => entry.categoryId === null)
        .map((entry) => entry.menuProduct),
    };
  });

export type ListMenuImpl = typeof listMenuImpl;
