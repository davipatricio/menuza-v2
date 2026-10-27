/**
 * Shared plumbing for the SEO procedures (MEN-233 / MEN-253).
 *
 * The entity name is the piece every read needs: it is the fallback title, the
 * `%entity%` token value, and the NOT_FOUND decision (a cross-tenant id must not
 * leak existence). It also feeds `resolveSeo`, so the resolution lives here
 * rather than in each of the six implementations.
 */
import { db } from "@menuza/db";
import { ORPCError } from "@orpc/server";
import {
  parseJsonLd,
  resolveSeo,
  type ResolvedSeo,
  type SeoEntityType,
  type SeoFields,
  type SeoMetaRow,
} from "@menuza/shared/seo";
import { notFound } from "../session/support.ts";

/** `null` and a blank string both mean "not set here" — revert is per field. */
export function seoText(value: string | null): string | null {
  if (value === null) return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/** The five editable columns as the contract carries them, nulls preserved. */
export function toSeoFields(row: SeoMetaRow | null | undefined): SeoFields {
  return {
    title: row?.title ?? null,
    description: row?.description ?? null,
    canonicalUrl: row?.canonicalUrl ?? null,
    socialImageUrl: row?.socialImageUrl ?? null,
    jsonLd: row?.jsonLd ?? null,
  };
}

/** A row with no field set is the same as no row: it would only add noise. */
export function isEmptySeo(fields: SeoFields): boolean {
  return Object.values(fields).every((value) => value === null);
}

/**
 * Rejects a `jsonLd` that is not JSON. The browser parses the block too, but
 * only to point at the offending line while the merchant types; the API is what
 * refuses to store a broken block, so nothing broken ever reaches a crawler.
 */
export function assertJsonLd(value: string): void {
  const parsed = parseJsonLd(value);

  if (parsed.ok) return;

  throw new ORPCError("VALIDATION_FAILED", {
    message: `JSON-LD inválido na linha ${parsed.error.line}, coluna ${parsed.error.column}: ${parsed.error.message}`,
    data: { code: "VALIDATION_FAILED" },
  });
}

/**
 * The entity's own name per type. Every query carries an explicit `tenantId`,
 * so an id from another store resolves to `null` and the caller 404s. A coupon
 * is addressed to the buyer by its code, so the code is its name.
 */
const NAME_QUERIES: Record<
  Exclude<SeoEntityType, "store">,
  (tenantId: string, entityId: string) => Promise<string | null>
> = {
  product: async (tenantId, id) =>
    (await db.orm.public.Product.where({ tenantId, id }).first())?.name ?? null,
  kit: async (tenantId, id) =>
    (await db.orm.public.Kit.where({ tenantId, id }).first())?.name ?? null,
  category: async (tenantId, id) =>
    (await db.orm.public.Category.where({ tenantId, id }).first())?.name ?? null,
  department: async (tenantId, id) =>
    (await db.orm.public.Department.where({ tenantId, id }).first())?.name ?? null,
  tag: async (tenantId, id) =>
    (await db.orm.public.Tag.where({ tenantId, id }).first())?.name ?? null,
  coupon: async (tenantId, id) =>
    (await db.orm.public.Coupon.where({ tenantId, id }).first())?.code ?? null,
};

/** The entity's own name (the coupon's code), or NOT_FOUND. */
export async function loadEntityName(
  tenantId: string,
  entityType: SeoEntityType,
  entityId: string,
  storeName: string,
): Promise<string> {
  // The store is its own tenant, so its entity id is the tenant id.
  if (entityType === "store") {
    if (entityId !== tenantId) throw notFound();

    return storeName;
  }

  const name = await NAME_QUERIES[entityType](tenantId, entityId);

  if (name === null) throw notFound();

  return name;
}

/** The tenant's settings row, mapped into the shared defaults shape. */
export async function loadStoreDefaults(tenantId: string) {
  const settings = await db.orm.public.StoreSettings.where({ tenantId }).first();

  return {
    seoTitleTemplate: settings?.seoTitleTemplate ?? null,
    seoDescriptionTemplate: settings?.seoDescriptionTemplate ?? null,
    seoSocialImageUrl: settings?.seoSocialImageUrl ?? null,
  };
}

/**
 * Reads the entity row, the store-level row and the settings templates, then
 * resolves field by field. The caller has already opened the tenant scope.
 */
export async function loadResolved(input: {
  tenantId: string;
  storeName: string;
  entityType: SeoEntityType;
  entityId: string;
  entityName: string;
}): Promise<{ saved: SeoFields; resolved: ResolvedSeo }> {
  const { tenantId, storeName, entityType, entityId, entityName } = input;

  const storeRowQuery =
    entityType === "store"
      ? null
      : db.orm.public.SeoMeta.where({ tenantId, entityType: "store", entityId: tenantId }).first();

  const [entityRow, storeRow, settings] = await Promise.all([
    db.orm.public.SeoMeta.where({ tenantId, entityType, entityId }).first(),
    storeRowQuery,
    loadStoreDefaults(tenantId),
  ]);

  const resolved = resolveSeo({
    entity: entityRow,
    storeRow,
    settings,
    context: { storeName, entityName },
    fallbackTitle: entityName,
  });

  return { saved: toSeoFields(entityRow), resolved };
}
