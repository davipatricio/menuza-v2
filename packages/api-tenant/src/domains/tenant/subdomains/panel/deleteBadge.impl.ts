import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.deleteBadge,
).$context<RequestHeadersHandlerPluginContext>();

export const deleteBadgeImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.Badge.where({ tenantId: store.tenantId, id: input.badgeId }).first(),
  );

  if (!existing) throw notFound();

  await inTenantScope(store.tenantId, () =>
    db.orm.public.Badge.where({ tenantId: store.tenantId, id: input.badgeId }).deleteAll(),
  );

  return { success: true };
});

export type DeleteBadgeImpl = typeof deleteBadgeImpl;
