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
 * Saves one entity's override, partially: an omitted field keeps the stored
 * value, `null` (or an empty string) is written as `null`, which is the
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

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.SeoMeta.where({
      tenantId: store.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
    }).first(),
  );

  const fields = toSeoFields({
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title === undefined ? (existing?.title ?? null) : seoText(input.title),
    description:
      input.description === undefined
        ? (existing?.description ?? null)
        : seoText(input.description),
    canonicalUrl:
      input.canonicalUrl === undefined
        ? (existing?.canonicalUrl ?? null)
        : seoText(input.canonicalUrl),
    socialImageUrl:
      input.socialImageUrl === undefined
        ? (existing?.socialImageUrl ?? null)
        : seoText(input.socialImageUrl),
    jsonLd: input.jsonLd === undefined ? (existing?.jsonLd ?? null) : seoText(input.jsonLd),
  });

  // Parsed here, not only in the browser: the panel highlights the offending
  // line while the merchant types, but a broken block would otherwise ship to
  // every crawler that reads the page.
  if (fields.jsonLd !== null) assertJsonLd(fields.jsonLd);

  await inTenantScope(store.tenantId, async () => {
    if (isEmptySeo(fields)) {
      // `delete` drops the non-unique tenantId predicate in Prisma 8 RC.17;
      // `deleteAll` keeps it (the entity columns are equally non-unique).
      await db.orm.public.SeoMeta.where({
        tenantId: store.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
      }).deleteAll();

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
