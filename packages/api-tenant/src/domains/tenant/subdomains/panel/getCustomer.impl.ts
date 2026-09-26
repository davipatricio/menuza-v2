import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { loadCustomerRows } from "./customerRows.ts";
import { inTenantScope, resolveStore } from "./support.ts";
import { toPanelOrder } from "./format.ts";

const os = implement(
  tenantContractObject.panel.getCustomer,
).$context<RequestHeadersHandlerPluginContext>();

/** One customer and their orders, newest first. */
export const getCustomerImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const customer = (await loadCustomerRows(store.tenantId)).find(
    (row) => row.id === input.customerId,
  );

  if (!customer) throw notFound();

  const orders = await inTenantScope(store.tenantId, () =>
    db.orm.public.Order.where({ tenantId: store.tenantId, customerId: customer.id })
      .include("customer", (row) => row.select("id", "name"))
      .orderBy((o) => o.createdAt.desc())
      .all(),
  );

  return { customer, orders: orders.map(toPanelOrder) };
});

export type GetCustomerImpl = typeof getCustomerImpl;
