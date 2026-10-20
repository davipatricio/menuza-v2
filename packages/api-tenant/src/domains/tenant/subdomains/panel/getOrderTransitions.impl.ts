import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, resolveStore } from "./support.ts";
import { actorOf, transitionsOf } from "./orderOps.ts";

const os = implement(
  tenantContractObject.panel.getOrderTransitions,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * What the caller may do next on both axes. The engine filters by capability, so
 * the dashboard never renders a button the API would refuse.
 */
export const getOrderTransitionsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const order = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where({ tenantId: store.tenantId, code: input.orderCode }).first(),
  );

  if (!order) throw notFound();

  return { transitions: transitionsOf(order, actorOf(store.session.memberId, store.role)) };
});

export type GetOrderTransitionsImpl = typeof getOrderTransitionsImpl;
