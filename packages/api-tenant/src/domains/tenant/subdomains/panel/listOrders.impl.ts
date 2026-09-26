import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";
import { toPanelOrder } from "./format.ts";

const os = implement(
  tenantContractObject.panel.listOrders,
).$context<RequestHeadersHandlerPluginContext>();

/** Every order of the store, newest first, with its customer's name. */
export const listOrdersImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const orders = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where({ tenantId: store.tenantId })
      .include("customer", (customer) => customer.select("id", "name"))
      .orderBy((o) => o.createdAt.desc())
      .all(),
  );

  return { orders: orders.map(toPanelOrder) };
});

export type ListOrdersImpl = typeof listOrdersImpl;
