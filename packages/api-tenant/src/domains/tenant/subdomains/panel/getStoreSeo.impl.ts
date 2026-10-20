import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadResolved, loadStoreDefaults } from "./seoSupport.ts";

const os = implement(
  tenantContractObject.panel.getStoreSeo,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's SEO defaults: the two templates plus the resolved values a page
 * inherits when it has no override of its own (MEN-253). Rendered through
 * `%store%` with the store's own name, so the form can preview the effect.
 */
export const getStoreSeoImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "dashboard:read");

  const { resolved } = await inTenantScope(store.tenantId, () =>
    loadResolved({
      tenantId: store.tenantId,
      storeName: store.tenantName,
      entityType: "store",
      entityId: store.tenantId,
      entityName: store.tenantName,
    }),
  );

  const settings = await inTenantScope(store.tenantId, () => loadStoreDefaults(store.tenantId));

  return { settings, resolved };
});

export type GetStoreSeoImpl = typeof getStoreSeoImpl;
