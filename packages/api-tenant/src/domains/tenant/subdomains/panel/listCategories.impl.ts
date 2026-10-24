import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";
import { departmentLinksByCategory, isoOf } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.listCategories,
).$context<RequestHeadersHandlerPluginContext>();

/** `%`/`_` are wildcards in `ILIKE`; a literal search must escape them. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/**
 * Categories with their item counts and department links. Counts run through
 * the subcategories, because that is the level products attach to.
 */
export const listCategoriesImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const { rows, subcategories, products, links } = await inTenantScope(store.tenantId, async () => {
    const where =
      input.status === "active"
        ? { tenantId: store.tenantId, active: true }
        : input.status === "inactive"
          ? { tenantId: store.tenantId, active: false }
          : { tenantId: store.tenantId };

    let categoryIds: string[] | null = null;

    if (input.departmentId !== "") {
      const departmentLinks = await db.orm.public.CategoryDepartment.where({
        departmentId: input.departmentId,
      })
        .select("categoryId")
        .all();

      categoryIds = departmentLinks.map((link) => link.categoryId);
    }

    const base =
      categoryIds === null
        ? db.orm.public.Category.where(where)
        : db.orm.public.Category.where(where).where((category) => category.id.in(categoryIds));

    const filtered =
      input.q.trim() === ""
        ? base
        : base.where((category) => category.name.ilike(likePattern(input.q.trim())));

    const direction = input.order === "desc" ? "desc" : "asc";

    const sorted =
      input.sortBy === "name"
        ? direction === "desc"
          ? filtered.orderBy((category) => category.name.desc())
          : filtered.orderBy((category) => category.name.asc())
        : input.sortBy === "updatedAt"
          ? direction === "desc"
            ? filtered.orderBy((category) => category.updatedAt.desc())
            : filtered.orderBy((category) => category.updatedAt.asc())
          : direction === "desc"
            ? filtered.orderBy((category) => category.sortOrder.desc())
            : filtered.orderBy((category) => category.sortOrder.asc());

    return {
      rows: await sorted.orderBy((category) => category.id.asc()).all(),
      subcategories: await db.orm.public.Subcategory.where({ tenantId: store.tenantId })
        .select("id", "categoryId")
        .all(),
      products: await db.orm.public.Product.where({ tenantId: store.tenantId })
        .select("subcategoryId")
        .all(),
      links: await departmentLinksByCategory(db, store.tenantId),
    };
  });

  const categoryIdBySubcategory = new Map(
    subcategories.map((subcategory) => [subcategory.id, subcategory.categoryId]),
  );

  const counts = new Map<string, number>();

  for (const product of products) {
    if (product.subcategoryId === null) continue;

    const categoryId = categoryIdBySubcategory.get(product.subcategoryId);

    if (categoryId === undefined) continue;

    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }

  const categories = rows.map((category) => ({
    id: category.id,
    name: category.name,
    active: category.active,
    sortOrder: category.sortOrder,
    itemsCount: counts.get(category.id) ?? 0,
    updatedAt: isoOf(category.updatedAt),
    departmentIds: links.ids.get(category.id) ?? [],
    departmentNames: links.names.get(category.id) ?? [],
  }));

  if (input.sortBy === "itemsCount") {
    const direction = input.order === "desc" ? -1 : 1;

    categories.sort(
      (a, b) =>
        direction * (a.itemsCount - b.itemsCount) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  }

  return { categories };
});

export type ListCategoriesImpl = typeof listCategoriesImpl;
