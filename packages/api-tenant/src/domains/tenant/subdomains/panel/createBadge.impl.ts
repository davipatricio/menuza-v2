import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.createBadge,
).$context<RequestHeadersHandlerPluginContext>();

export const createBadgeImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const name = input.name.trim();

  const duplicate = await inTenantScope(store.tenantId, () =>
    db.orm.public.Badge.where({ tenantId: store.tenantId, name }).first(),
  );

  if (duplicate) throw catalogConflict("Já existe uma etiqueta com este nome.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Badge.create({
      id: randomUUID(),
      tenantId: store.tenantId,
      name,
      imageUrl: input.imageUrl.trim(),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    }),
  );

  return { success: true };
});

export type CreateBadgeImpl = typeof createBadgeImpl;
