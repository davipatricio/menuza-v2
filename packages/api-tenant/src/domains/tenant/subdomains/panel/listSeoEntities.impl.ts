import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import type { SeoEntityType } from "@menuza/shared/seo";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { isEmptySeo, toSeoFields } from "./seoSupport.ts";

const os = implement(
  tenantContractObject.panel.listSeoEntities,
).$context<RequestHeadersHandlerPluginContext>();

type EntityRow = { id: string; name: string };

/**
 * Every entity of the requested type with its override flag, so a list screen
 * can show which rows already carry SEO of their own (MEN-253).
 *
 * `hasOverride` reads the `SeoMeta` rows in one query and compares a
 * `type:id` key: an override row with all five fields empty is the same as no
 * override, because `saveSeo` deletes it.
 */
export const listSeoEntitiesImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "dashboard:read");

  const types: SeoEntityType[] = input.entityType
    ? [input.entityType]
    : ["store", "department", "category", "tag", "product", "kit", "coupon"];

  const { rows, overrides } = await inTenantScope(store.tenantId, async () => {
    const meta = await db.orm.public.SeoMeta.where({ tenantId: store.tenantId }).all();

    const overrides = new Set(
      meta
        .filter((row) => !isEmptySeo(toSeoFields(row)))
        .map((row) => `${row.entityType}:${row.entityId}`),
    );

    const names = new Map<SeoEntityType, EntityRow[]>();

    for (const type of types) {
      names.set(type, await loadEntities(store.tenantId, type, store.tenantName));
    }

    return { rows: names, overrides };
  });

  return {
    entities: types.flatMap((entityType) =>
      (rows.get(entityType) ?? []).map((entity) => ({
        entityType,
        entityId: entity.id,
        name: entity.name,
        hasOverride: overrides.has(`${entityType}:${entity.id}`),
      })),
    ),
  };
});

/** The named rows of one type. The store is its own tenant, so it has one row. */
async function loadEntities(
  tenantId: string,
  entityType: SeoEntityType,
  storeName: string,
): Promise<EntityRow[]> {
  if (entityType === "store") return [{ id: tenantId, name: storeName }];

  if (entityType === "product") {
    const rows = await db.orm.public.Product.where({ tenantId })
      .orderBy((p) => p.name.asc())
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  if (entityType === "kit") {
    const rows = await db.orm.public.Kit.where({ tenantId })
      .orderBy((k) => k.name.asc())
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  if (entityType === "category") {
    const rows = await db.orm.public.Category.where({ tenantId })
      .orderBy((c) => c.sortOrder.asc())
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  if (entityType === "department") {
    const rows = await db.orm.public.Department.where({ tenantId })
      .orderBy((d) => d.name.asc())
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  if (entityType === "tag") {
    const rows = await db.orm.public.Tag.where({ tenantId })
      .orderBy((t) => t.name.asc())
      .all();

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  const rows = await db.orm.public.Coupon.where({ tenantId })
    .orderBy((c) => c.code.asc())
    .all();

  // A coupon is addressed to the buyer by its code, so the code is its name.
  return rows.map((row) => ({ id: row.id, name: row.code }));
}

export type ListSeoEntitiesImpl = typeof listSeoEntitiesImpl;
