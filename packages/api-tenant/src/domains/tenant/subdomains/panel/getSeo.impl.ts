import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadEntityName, loadResolved } from "./seoSupport.ts";

const os = implement(
  tenantContractObject.panel.getSeo,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * One entity's saved override plus the values a page would render, with the
 * winning level per field so the form can label an inherited field instead of
 * pretending it is empty (MEN-253).
 */
export const getSeoImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "dashboard:read");

  const entityName = await inTenantScope(store.tenantId, () =>
    loadEntityName(store.tenantId, input.entityType, input.entityId, store.tenantName),
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

export type GetSeoImpl = typeof getSeoImpl;
