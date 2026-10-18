import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listDepartments,
).$context<RequestHeadersHandlerPluginContext>();

export const listDepartmentsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const { rows: departments, allProducts } = await inTenantScope(store.tenantId, async () => {
    const rows = await db.orm.public.Department.where({ tenantId: store.tenantId })
      .orderBy((d) => d.sortOrder.asc())
      .all();

    const allProducts = await db.orm.public.Product.where({ tenantId: store.tenantId })
      .select("departmentId")
      .all();

    return { rows, allProducts };
  });

  const counts = new Map<string, number>();

  for (const product of allProducts) {
    if (!product.departmentId) continue;
    counts.set(product.departmentId, (counts.get(product.departmentId) ?? 0) + 1);
  }

  return {
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      itemsCount: counts.get(department.id) ?? 0,
    })),
  };
});

export type ListDepartmentsImpl = typeof listDepartmentsImpl;
