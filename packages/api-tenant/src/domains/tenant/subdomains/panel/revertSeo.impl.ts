import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadEntityName, loadResolved } from "./seoSupport.ts";

const os = implement(
  tenantContractObject.panel.revertSeo,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Drops the whole row, which is what the form's "Reverter tudo" asks for. An id
 * that was never saved is a no-op rather than a 404 — the entity is what has to
 * exist, not the override.
 */
export const revertSeoImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "seo:write");

  const entityName = await inTenantScope(store.tenantId, () =>
    loadEntityName(store.tenantId, input.entityType, input.entityId, store.tenantName),
  );

  await inTenantScope(store.tenantId, () =>
    db.orm.public.SeoMeta.where({
      tenantId: store.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
    }).delete(),
  );

  return inTenantScope(store.tenantId, () =>
    loadResolved({
      tenantId: store.tenantId,
      storeName: store.tenantName,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName,
    }),
  );
});

export type RevertSeoImpl = typeof revertSeoImpl;
