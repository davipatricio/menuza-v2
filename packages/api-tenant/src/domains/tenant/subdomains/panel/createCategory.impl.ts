import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import {
  assertOwnedDepartments,
  ensureGeneralSubcategory,
  now,
  replaceCategoryDepartments,
} from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.createCategory,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * A category always receives its `Geral` subcategory, which is where products
 * land until someone splits them up. The rows, the links and the subcategory
 * are one transaction.
 */
export const createCategoryImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const name = input.name.trim();

  const duplicate = await inTenantScope(store.tenantId, () =>
    db.orm.public.Category.where({ tenantId: store.tenantId, name }).first(),
  );

  if (duplicate) throw catalogConflict("Já existe uma categoria com este nome.");

  await inTenantScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      await assertOwnedDepartments(tx, store.tenantId, input.departmentIds);

      const id = randomUUID();

      await tx.orm.public.Category.create({
        id,
        tenantId: store.tenantId,
        name,
        sortOrder: input.sortOrder,
        active: input.active,
        updatedAt: now(),
      });

      await replaceCategoryDepartments(tx, store.tenantId, id, input.departmentIds);

      await ensureGeneralSubcategory(tx, store.tenantId, id);
    }),
  );

  return { success: true };
});

export type CreateCategoryImpl = typeof createCategoryImpl;
