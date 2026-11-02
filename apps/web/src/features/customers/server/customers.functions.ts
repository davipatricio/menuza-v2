/**
 * Server functions for the customers screens: the list and one customer's
 * detail with their orders. No caching directives — the list is a single panel
 * read per navigation and the detail is scoped to one row.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { PanelCustomer, PanelOrder } from "@menuza/shared/tenant";
import { panelClient } from "@/server/panel-client.ts";

export type CustomerRow = PanelCustomer;

export type CustomerDetail = {
  status: "ok";
  customer: PanelCustomer;
  orders: PanelOrder[];
};

export type CustomerDetailResult =
  | CustomerDetail
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const listCustomersFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listCustomers({ storeSlug: data.storeSlug });
  });

export const loadCustomerFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string(), customerId: v.string() }))
  .handler(async ({ data }): Promise<CustomerDetailResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const detail = await client.panel.getCustomer({
        storeSlug: data.storeSlug,
        customerId: data.customerId,
      });

      return { status: "ok", customer: detail.customer, orders: detail.orders };
    } catch {
      // An unknown id and another store's id are indistinguishable to the API;
      // both mean the customer is not here.
      return { status: "not-found" };
    }
  });

export type PanelCustomersPayload = NonNullable<Awaited<ReturnType<typeof listCustomersFn>>>;
