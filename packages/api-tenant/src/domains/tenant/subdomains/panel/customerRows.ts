import { db } from "@menuza/db";
import type { PanelCustomer } from "@menuza/shared/tenant";
import { inTenantScope } from "./support.ts";

/**
 * Per-customer aggregates for one tenant: order count and total spent, in cents.
 *
 * Derived from the tenant's own orders on every read rather than stored, so the
 * customer table and the customer detail page can never disagree with the order
 * list. Also reused by `getCustomer`, which is why it is separate.
 */
export async function loadCustomerRows(tenantId: string): Promise<PanelCustomer[]> {
  const { rows: customers, allOrders: orders } = await inTenantScope(tenantId, async () => {
    const rows = await db.orm.public.Customer.where({ tenantId })
      .orderBy((c) => c.name.asc())
      .all();

    const allOrders = await db.orm.public.Order.where({ tenantId })
      .select("customerId", "totalCents")
      .all();

    return { rows, allOrders };
  });

  const totals = new Map<string, { count: number; cents: number }>();

  for (const order of orders) {
    const entry = totals.get(order.customerId) ?? { count: 0, cents: 0 };

    entry.count += 1;
    entry.cents += order.totalCents;
    totals.set(order.customerId, entry);
  }

  return customers.map((customer) => {
    const entry = totals.get(customer.id);

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      ordersCount: entry?.count ?? 0,
      totalSpentCents: entry?.cents ?? 0,
    };
  });
}
