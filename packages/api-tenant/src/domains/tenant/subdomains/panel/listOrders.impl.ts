import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import type { FinancialStatus, FulfilmentStatus, PaymentMethod } from "@menuza/shared/tenant";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";
import { toPanelOrder } from "./format.ts";

const os = implement(
  tenantContractObject.panel.listOrders,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The `where` filter the board's reads use. Every clause is an equality on a
 * closed enum column; an absent key means "no filter", never a wildcard, and
 * `tenantId` is always present — that equality is what the isolation middleware
 * reads.
 */
interface OrdersFilter {
  tenantId: string;
  financialStatus?: FinancialStatus;
  fulfilmentStatus?: FulfilmentStatus;
  paymentMethod?: PaymentMethod;
}

/** Every order of the store, newest first, with its customer's name. */
export const listOrdersImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const filter: OrdersFilter = { tenantId: store.tenantId };

  if (input.financialStatus) filter.financialStatus = input.financialStatus;

  if (input.fulfilmentStatus) filter.fulfilmentStatus = input.fulfilmentStatus;

  if (input.paymentMethod) filter.paymentMethod = input.paymentMethod;

  const orders = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where(filter)
      .include("customer", (customer) => customer.select("id", "name"))
      .orderBy((o) => o.createdAt.desc())
      .all(),
  );

  return { orders: orders.map(toPanelOrder) };
});

export type ListOrdersImpl = typeof listOrdersImpl;
