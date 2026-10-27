import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadPaymentSettings } from "./paymentSupport.ts";

const os = implement(
  tenantContractObject.panel.getPaymentSettings,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's gateway connections and which one answers each payment method.
 * The provider secret is never part of the answer: `hasCredentials` only says
 * whether one is stored.
 */
export const getPaymentSettingsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "payments:read");

  return inTenantScope(store.tenantId, () => loadPaymentSettings(store.tenantId));
});

export type GetPaymentSettingsImpl = typeof getPaymentSettingsImpl;
