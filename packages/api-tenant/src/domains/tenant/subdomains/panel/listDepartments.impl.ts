import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";
import { isoOf } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.listDepartments,
).$context<RequestHeadersHandlerPluginContext>();

/** `%`/`_` are wildcards in `ILIKE`; a literal search must escape them. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/**
 * Departments with their item counts. A department has no products of its own:
 * the count walks department → linked categories → subcategories → products.
 */
export const listDepartmentsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const { rows, links, categories, subcategories, products } = await inTenantScope(
    store.tenantId,
    async () => {
      const where =
        input.status === "active"
          ? { tenantId: store.tenantId, active: true }
          : input.status === "inactive"
            ? { tenantId: store.tenantId, active: false }
            : { tenantId: store.tenantId };

      const base = db.orm.public.Department.where(where);

      const filtered =
        input.q.trim() === ""
          ? base
          : base.where((department) => department.name.ilike(likePattern(input.q.trim())));

      const direction = input.order === "desc" ? "desc" : "asc";

      const sorted =
        input.sortBy === "updatedAt"
          ? direction === "desc"
            ? filtered.orderBy((department) => department.updatedAt.desc())
            : filtered.orderBy((department) => department.updatedAt.asc())
          : direction === "desc"
            ? filtered.orderBy((department) => department.name.desc())
            : filtered.orderBy((department) => department.name.asc());

      return {
        rows: await sorted.orderBy((department) => department.id.asc()).all(),
        links: await db.orm.public.CategoryDepartment.all(),
        categories: await db.orm.public.Category.where({ tenantId: store.tenantId })
          .select("id")
          .all(),
        subcategories: await db.orm.public.Subcategory.where({ tenantId: store.tenantId })
          .select("id", "categoryId")
          .all(),
        products: await db.orm.public.Product.where({ tenantId: store.tenantId })
          .select("subcategoryId")
          .all(),
      };
    },
  );

  const ownedCategories = new Set(categories.map((category) => category.id));

  const departmentIdsByCategory = new Map<string, string[]>();

  for (const link of links) {
    if (!ownedCategories.has(link.categoryId)) continue;

    departmentIdsByCategory.set(link.categoryId, [
      ...(departmentIdsByCategory.get(link.categoryId) ?? []),
      link.departmentId,
    ]);
  }

  const categoryIdBySubcategory = new Map(
    subcategories.map((subcategory) => [subcategory.id, subcategory.categoryId]),
  );

  const counts = new Map<string, number>();

  for (const product of products) {
    if (product.subcategoryId === null) continue;

    const categoryId = categoryIdBySubcategory.get(product.subcategoryId);

    if (categoryId === undefined) continue;

    for (const departmentId of departmentIdsByCategory.get(categoryId) ?? []) {
      counts.set(departmentId, (counts.get(departmentId) ?? 0) + 1);
    }
  }

  const departments = rows.map((department) => ({
    id: department.id,
    name: department.name,
    active: department.active,
    itemsCount: counts.get(department.id) ?? 0,
    updatedAt: isoOf(department.updatedAt),
  }));

  if (input.sortBy === "itemsCount") {
    const direction = input.order === "desc" ? -1 : 1;

    departments.sort(
      (a, b) =>
        direction * (a.itemsCount - b.itemsCount) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  }

  return { departments };
});

export type ListDepartmentsImpl = typeof listDepartmentsImpl;
