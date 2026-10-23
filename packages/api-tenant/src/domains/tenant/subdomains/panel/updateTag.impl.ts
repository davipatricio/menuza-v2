import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.updateTag,
).$context<RequestHeadersHandlerPluginContext>();

export const updateTagImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Tag.where({ tenantId: store.tenantId, id: input.tagId }).first(),
  );

  if (!existing) throw notFound();

  const name = input.name.trim();

  if (name !== existing.name) {
    const duplicate = await inTenantScope(store.tenantId, () =>
      db.orm.public.Tag.where({ tenantId: store.tenantId, name }).first(),
    );

    if (duplicate) throw catalogConflict("Já existe uma tag com este nome.");
  }

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Tag.where({ tenantId: store.tenantId, id: input.tagId }).updateAll({
      name,
      isActive: input.isActive,
    }),
  );

  return { success: true };
});

export type UpdateTagImpl = typeof updateTagImpl;
