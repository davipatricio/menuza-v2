import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadResolved, loadStoreDefaults, seoText } from "./seoSupport.ts";

const os = implement(
  tenantContractObject.panel.saveStoreSeo,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Writes the store-level templates. One row per tenant: upsert on `tenantId`
 * rather than read-then-write, so two admin tabs cannot lose each other's save.
 *
 * The settings row also carries the social image, which is store-level
 * configuration and not a per-page override.
 */
export const saveStoreSeoImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "seo:write");

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  const values = {
    seoTitleTemplate: seoText(input.seoTitleTemplate),
    seoDescriptionTemplate: seoText(input.seoDescriptionTemplate),
    seoSocialImageUrl: seoText(input.seoSocialImageUrl),
  };

  await inTenantScope(store.tenantId, () =>
    db.orm.public.StoreSettings.upsert({
      create: { id: randomUUID(), tenantId: store.tenantId, updatedAt: now, ...values },
      update: { ...values, updatedAt: now },
      conflictOn: { tenantId: store.tenantId },
    }),
  );

  const { resolved } = await inTenantScope(store.tenantId, () =>
    loadResolved({
      tenantId: store.tenantId,
      storeName: store.tenantName,
      entityType: "store",
      entityId: store.tenantId,
      entityName: store.tenantName,
    }),
  );

  const settings = await inTenantScope(store.tenantId, () => loadStoreDefaults(store.tenantId));

  return { settings, resolved };
});

export type SaveStoreSeoImpl = typeof saveStoreSeoImpl;
