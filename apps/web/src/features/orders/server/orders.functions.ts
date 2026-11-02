/**
 * Server functions behind the orders screens.
 *
 * Both reads are thin panel calls: the tenant API is the only authority for the
 * store scope, and the board/detail render whatever it returns. `null` still
 * means "no panel session" for the list, while the detail distinguishes a
 * missing order from a missing session so the route can 404 or sign in again.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import {
  FinancialStatusSchema,
  PaymentMethodSchema,
  type PanelOrder,
  type PanelOrderDetail,
  type PanelOrderTransition,
} from "@menuza/shared/tenant";
import { panelClient } from "@/server/panel-client.ts";

export type OrderRow = PanelOrder;

export const listOrdersFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      financialStatus: v.optional(v.picklist([...FinancialStatusSchema.options])),
      paymentMethod: v.optional(v.picklist([...PaymentMethodSchema.options])),
    }),
  )
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listOrders({
      storeSlug: data.storeSlug,
      financialStatus: data.financialStatus,
      paymentMethod: data.paymentMethod,
    });
  });

export type OrderDetailResult =
  | { status: "ok"; order: PanelOrderDetail; transitions: PanelOrderTransition[] }
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const loadOrderFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string(), orderCode: v.string() }))
  .handler(async ({ data }): Promise<OrderDetailResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const [{ order }, { transitions }] = await Promise.all([
        client.panel.getOrder({ storeSlug: data.storeSlug, orderCode: data.orderCode }),
        client.panel.getOrderTransitions({ storeSlug: data.storeSlug, orderCode: data.orderCode }),
      ]);

      return { status: "ok", order, transitions };
    } catch {
      // An unknown code and another store's code are both NOT_FOUND at the API.
      return { status: "not-found" };
    }
  });

export type PanelOrdersPayload = NonNullable<Awaited<ReturnType<typeof listOrdersFn>>>;
