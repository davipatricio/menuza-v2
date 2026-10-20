import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, resolveStore } from "./support.ts";
import { toPanelOrder, toPanelTimestamp } from "./format.ts";

const os = implement(
  tenantContractObject.panel.getOrder,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * One order, addressed by the code the dashboard URL carries, with its lines and
 * its append-only trail.
 *
 * The event actor is resolved to a name here rather than in the UI: the trail
 * outlives the membership that wrote it, so the name is a display convenience
 * (`null` when the event is machine-written or the member is gone), never an
 * authorization fact.
 */
export const getOrderImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const loaded = await inTenantScope(store.tenantId, async () => {
    const order = await db.orm.public.Order.where({
      tenantId: store.tenantId,
      code: input.orderCode,
    })
      .include("customer", (customer) => customer.select("id", "name"))
      .first();

    if (!order) return null;

    const [items, events] = await Promise.all([
      db.orm.public.OrderItem.where({ tenantId: store.tenantId, orderId: order.id })
        .orderBy((item) => item.name.asc())
        .all(),
      db.orm.public.OrderEvent.where({ tenantId: store.tenantId, orderId: order.id })
        .orderBy((event) => event.createdAt.asc())
        .all(),
    ]);

    return { order, items, events };
  });

  if (!loaded) throw notFound();

  const actors = await loadActorNames(loaded.events.map((event) => event.actorMemberId));

  return {
    order: {
      ...toPanelOrder(loaded.order),
      items: loaded.items.map((item) => ({
        id: item.id,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
        optionsLabel: item.optionsLabel ?? null,
      })),
      events: loaded.events.map((event) => ({
        id: event.id,
        type: event.type,
        fromValue: event.fromValue ?? null,
        toValue: event.toValue ?? null,
        reason: event.reason ?? null,
        actorName: event.actorMemberId === null ? null : (actors.get(event.actorMemberId) ?? null),
        createdAt: toPanelTimestamp(event.createdAt),
      })),
    },
  };
});

/**
 * The names behind the trail's `actorMemberId`s. `Member` is not tenant-scoped
 * (an account spans stores), so this needs no tenant scope. A member that was
 * deleted simply has no name, which the UI renders as a machine action rather
 * than inventing one.
 */
async function loadActorNames(actorIds: readonly (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(actorIds.filter((id): id is string => id !== null))];

  const members = await Promise.all(ids.map((id) => db.orm.public.Member.where({ id }).first()));

  const names = new Map<string, string>();

  for (const member of members) {
    if (!member) continue;

    names.set(member.id, member.name ?? member.email);
  }

  return names;
}

export type GetOrderImpl = typeof getOrderImpl;
