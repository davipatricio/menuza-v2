import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";
import { isoOf } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.listSubcategories,
).$context<RequestHeadersHandlerPluginContext>();

/** `%`/`_` are wildcards in `ILIKE`; a literal search must escape them. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/** The optional keys the list filter adds on top of the mandatory tenant. */
type SubcategoryListWhere = {
  tenantId: string;
  active?: boolean;
  categoryId?: string;
};

export const listSubcategoriesImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const { rows, products, categories } = await inTenantScope(store.tenantId, async () => {
    const where: SubcategoryListWhere = { tenantId: store.tenantId };

    if (input.status === "active") where.active = true;

    if (input.status === "inactive") where.active = false;

    if (input.categoryId !== "") where.categoryId = input.categoryId;

    const base = db.orm.public.Subcategory.where(where);

    const filtered =
      input.q.trim() === ""
        ? base
        : base.where((subcategory) => subcategory.name.ilike(likePattern(input.q.trim())));

    const direction = input.order === "desc" ? "desc" : "asc";

    const sorted =
      input.sortBy === "name"
        ? direction === "desc"
          ? filtered.orderBy((subcategory) => subcategory.name.desc())
          : filtered.orderBy((subcategory) => subcategory.name.asc())
        : input.sortBy === "updatedAt"
          ? direction === "desc"
            ? filtered.orderBy((subcategory) => subcategory.updatedAt.desc())
            : filtered.orderBy((subcategory) => subcategory.updatedAt.asc())
          : direction === "desc"
            ? filtered.orderBy((subcategory) => subcategory.sortOrder.desc())
            : filtered.orderBy((subcategory) => subcategory.sortOrder.asc());

    return {
      rows: await sorted.orderBy((subcategory) => subcategory.id.asc()).all(),
      products: await db.orm.public.Product.where({ tenantId: store.tenantId })
        .select("subcategoryId")
        .all(),
      categories: await db.orm.public.Category.where({ tenantId: store.tenantId })
        .select("id", "name")
        .all(),
    };
  });

  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  const counts = new Map<string, number>();

  for (const product of products) {
    if (product.subcategoryId === null) continue;

    counts.set(product.subcategoryId, (counts.get(product.subcategoryId) ?? 0) + 1);
  }

  const subcategories = rows.map((subcategory) => ({
    id: subcategory.id,
    name: subcategory.name,
    categoryId: subcategory.categoryId,
    categoryName: categoryNameById.get(subcategory.categoryId) ?? "",
    active: subcategory.active,
    sortOrder: subcategory.sortOrder,
    itemsCount: counts.get(subcategory.id) ?? 0,
    updatedAt: isoOf(subcategory.updatedAt),
  }));

  if (input.sortBy === "itemsCount") {
    const direction = input.order === "desc" ? -1 : 1;

    subcategories.sort(
      (a, b) =>
        direction * (a.itemsCount - b.itemsCount) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  }

  return { subcategories };
});

export type ListSubcategoriesImpl = typeof listSubcategoriesImpl;
