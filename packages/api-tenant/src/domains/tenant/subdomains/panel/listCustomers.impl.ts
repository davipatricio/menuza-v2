import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { loadCustomerRows } from "./customerRows.ts";
import { resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listCustomers,
).$context<RequestHeadersHandlerPluginContext>();

/** Every customer of the store, with order count and total spent in cents. */
export const listCustomersImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  return { customers: await loadCustomerRows(store.tenantId) };
});

export type ListCustomersImpl = typeof listCustomersImpl;
