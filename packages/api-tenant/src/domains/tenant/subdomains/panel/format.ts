/**
 * Formatting shared by the panel read implementations.
 *
 * `Timestamp(3)` columns decode as `Temporal.PlainDateTime`; the contract
 * carries ISO-8601 strings, so every procedure formats the same way.
 */
import type { PanelOrder } from "@menuza/shared/tenant";
import { db } from "@menuza/db";

/** The order query the panel reads, with the customer's name loaded. */
const ordersWithCustomer = () =>
  db.orm.public.Order.include("customer", (customer) => customer.select("id", "name"));

type OrderWithCustomer = NonNullable<
  Awaited<ReturnType<ReturnType<typeof ordersWithCustomer>["first"]>>
>;

/**
 * The panel's timestamp format (MEN-225).
 *
 * `Timestamp(3)` columns decode as `Temporal.PlainDateTime` — UTC-naive, to
 * match what the v7 client wrote. Two consequences:
 *
 *  - Second precision, not minutes: truncating at the API boundary would lose
 *    data the audit trail is supposed to keep.
 *  - The `Z` is required. `Timestamp` is UTC by contract, but a PlainDateTime
 *    carries no offset, and the contract's `isoTimestamp()` rejects a string
 *    without one. Re-attaching UTC at the edge keeps the stored value naive and
 *    the wire value unambiguous.
 */
export function toPanelTimestamp(value: Temporal.PlainDateTime): string {
  return `${value.toString({ smallestUnit: "second" })}Z`;
}

/**
 * One order row as the panel's tables read it: ISO timestamp, Int cents, and
 * the customer's name resolved from the eager-loaded relation.
 */
export function toPanelOrder(order: OrderWithCustomer): PanelOrder {
  // `Order.customerId` is NOT NULL with a RESTRICT FK, so the eager load
  // always resolves. The check is here rather than at each call site because
  // Prisma types every eager-loaded relation as nullable regardless.
  const customerName = order.customer?.name;

  if (customerName === undefined) {
    throw new Error(`Order ${order.code} names customer ${order.customerId}, which is gone`);
  }

  return {
    id: order.id,
    code: order.code,
    customerId: order.customerId,
    customerName,
    totalCents: order.totalCents,
    status: order.status,
    createdAt: toPanelTimestamp(order.createdAt),
  };
}
