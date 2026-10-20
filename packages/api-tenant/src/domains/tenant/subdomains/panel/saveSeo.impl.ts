import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import {
  assertJsonLd,
  isEmptySeo,
  loadEntityName,
  loadResolved,
  seoText,
  toSeoFields,
} from "./seoSupport.ts";

const os = implement(
  tenantContractObject.panel.saveSeo,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Saves one entity's override. Empty fields are written as `null`, which is the
 * per-field "revert" the form offers: `resolveSeo` then falls through to the
 * store row, the templates, and the static default in turn (MEN-253).
 *
 * A row whose five fields are all empty is deleted rather than stored, so the
 * list's `hasOverride` never claims an override that resolves to nothing.
 */
export const saveSeoImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "seo:write");

  const entityName = await inTenantScope(store.tenantId, () =>
    loadEntityName(store.tenantId, input.entityType, input.entityId, store.tenantName),
  );

  const fields = toSeoFields({
    entityType: input.entityType,
    entityId: input.entityId,
    title: seoText(input.title),
    description: seoText(input.description),
    canonicalUrl: seoText(input.canonicalUrl),
    socialImageUrl: seoText(input.socialImageUrl),
    jsonLd: seoText(input.jsonLd),
  });

  // Parsed here, never in the browser: a broken block would otherwise ship to
  // every crawler that reads the page.
  if (fields.jsonLd !== null) assertJsonLd(fields.jsonLd);

  await inTenantScope(store.tenantId, async () => {
    if (isEmptySeo(fields)) {
      await db.orm.public.SeoMeta.where({
        tenantId: store.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
      }).delete();

      return;
    }

    await db.orm.public.SeoMeta.upsert({
      create: {
        id: randomUUID(),
        tenantId: store.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        ...fields,
      },
      update: { ...fields },
      conflictOn: {
        tenantId: store.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  });

  const result = await inTenantScope(store.tenantId, () =>
    loadResolved({
      tenantId: store.tenantId,
      storeName: store.tenantName,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName,
    }),
  );

  return result;
});

export type SaveSeoImpl = typeof saveSeoImpl;
