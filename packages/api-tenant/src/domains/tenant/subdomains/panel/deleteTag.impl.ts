import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { catalogConflict } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.deleteTag,
).$context<RequestHeadersHandlerPluginContext>();

/** A tag still linked to a product would vanish from that product silently. */
export const deleteTagImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Tag.where({ tenantId: store.tenantId, id: input.tagId }).first(),
  );

  if (!existing) throw notFound();

  const link = await inTenantScope(store.tenantId, () =>
    db.orm.public.ProductTag.where({ tagId: input.tagId }).first(),
  );

  if (link) throw catalogConflict("Remova esta tag dos produtos antes de excluí-la.");

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Tag.where({ tenantId: store.tenantId, id: input.tagId }).delete(),
  );

  return { success: true };
});

export type DeleteTagImpl = typeof deleteTagImpl;
