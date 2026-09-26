import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, resolveStore } from "./support.ts";
import { toPanelOrder } from "./format.ts";

const os = implement(
  tenantContractObject.panel.getOrder,
).$context<RequestHeadersHandlerPluginContext>();

/** One order, addressed by the code the dashboard URL carries. */
export const getOrderImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const order = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where({ tenantId: store.tenantId, code: input.orderCode })
      .include("customer", (customer) => customer.select("id", "name"))
      .first(),
  );

  if (!order) throw notFound();

  return { order: toPanelOrder(order) };
});

export type GetOrderImpl = typeof getOrderImpl;
