import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listKits,
).$context<RequestHeadersHandlerPluginContext>();

export const listKitsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const kits = await inTenantScope(store.tenantId, () =>
    db.orm.public.Kit.where({ tenantId: store.tenantId })
      .include("items")
      .orderBy((k) => k.name.asc())
      .all(),
  );

  return {
    kits: kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      mode: kit.mode,
      available: kit.available,
      itemsCount: kit.items.length,
    })),
  };
});

export type ListKitsImpl = typeof listKitsImpl;
