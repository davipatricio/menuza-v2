import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.updateBadge,
).$context<RequestHeadersHandlerPluginContext>();

export const updateBadgeImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Badge.where({ tenantId: store.tenantId, id: input.badgeId }).first(),
  );

  if (!existing) throw notFound();

  // A partial save: an omitted field keeps the stored value, so the row is
  // written whole and never loses a column the caller did not send.
  const name = input.name?.trim() ?? existing.name;

  if (name !== existing.name) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Badge.where({ tenantId: store.tenantId, name }).first(),
    );

    if (duplicate) throw catalogConflict("Já existe uma etiqueta com este nome.");
  }

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Badge.where({ tenantId: store.tenantId, id: input.badgeId }).updateAll({
      name,
      imageUrl: input.imageUrl?.trim() ?? existing.imageUrl,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: now(),
    }),
  );

  return { success: true };
});

export type UpdateBadgeImpl = typeof updateBadgeImpl;
