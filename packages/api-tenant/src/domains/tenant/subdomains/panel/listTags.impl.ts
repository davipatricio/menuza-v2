import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listTags,
).$context<RequestHeadersHandlerPluginContext>();

export const listTagsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const { rows: tags, productTags } = await inTenantScope(store.tenantId, async () => {
    const rows = await db.orm.public.Tag.where({ tenantId: store.tenantId }).all();

    const productTags = await db.orm.public.ProductTag.all();

    return { rows, productTags };
  });

  const counts = new Map<string, number>();

  for (const entry of productTags) {
    counts.set(entry.tagId, (counts.get(entry.tagId) ?? 0) + 1);
  }

  const direction = input.order === "desc" ? -1 : 1;

  const result = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    isActive: tag.isActive,
    itemsCount: counts.get(tag.id) ?? 0,
  }));

  // Names are unique per tenant; the id tiebreaker only keeps the order total.
  result.sort((a, b) =>
    input.sortBy === "itemsCount"
      ? direction * (a.itemsCount - b.itemsCount) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.id.localeCompare(b.id)
      : direction * a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id),
  );

  return { tags: result };
});

export type ListTagsImpl = typeof listTagsImpl;
