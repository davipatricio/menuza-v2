import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listBadges,
).$context<RequestHeadersHandlerPluginContext>();

export const listBadgesImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "dashboard:read");

  const { rows: badges, productBadges } = await inTenantScope(store.tenantId, async () => {
    const rows = await db.orm.public.Badge.where({ tenantId: store.tenantId })
      .orderBy((b) => b.sortOrder.asc())
      .orderBy((b) => b.name.asc())
      .all();

    const productBadges = await db.orm.public.ProductBadge.where({
      tenantId: store.tenantId,
    }).all();

    return { rows, productBadges };
  });

  const counts = new Map<string, number>();

  for (const entry of productBadges) {
    counts.set(entry.badgeId, (counts.get(entry.badgeId) ?? 0) + 1);
  }

  const result = badges.map((badge) => ({
    id: badge.id,
    name: badge.name,
    imageUrl: badge.imageUrl,
    sortOrder: badge.sortOrder,
    isActive: badge.isActive,
    itemsCount: counts.get(badge.id) ?? 0,
  }));

  return { badges: result };
});

export type ListBadgesImpl = typeof listBadgesImpl;
