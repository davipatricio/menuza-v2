/**
 * Shared pieces of the storefront's public reads (MEN-260).
 *
 * The tenant id arrives as `x-menuza-tenant-id`, written server-side by the web
 * proxy's host→mode map and read by `tenantMiddleware({ require: "optional" })`.
 * A request without it is not an error: the storefront asks before a tenant is
 * known, so the procedures answer with empty results instead of failing.
 *
 * ponytail: the header is trusted as-is, which assumes only the proxy reaches
 * this loopback-bound service. Ceiling: a direct caller can forge the header
 * and read another store's public catalog (no secrets, but the wrong store).
 * Upgrade path: the tenant API's flow — host → `Domain` row, then membership —
 * rather than a second auth scheme invented here.
 */
import { db } from "@menuza/db";
import { resolveSeo, type ResolvedSeo, type SeoEntityType } from "@menuza/shared/seo";
import type * as v from "valibot";
import type {
  PublicNutritionSchema,
  PublicProductDetailSchema,
  publicSeoOutput,
} from "@menuza/shared/commerce";

/**
 * `Timestamp(3)` decodes as `Temporal.PlainDateTime` (UTC-naive, no offset), and
 * the contract's `isoTimestamp()` rejects a string without one — re-attach UTC
 * at the edge, exactly like the tenant panel does.
 */
export function toIsoTimestamp(value: Temporal.PlainDateTime): string {
  return `${value.toString({ smallestUnit: "second" })}Z`;
}

/** The tenant row, or `null` when the request carries no resolved tenant. */
export function loadTenant(tenantId: string | undefined) {
  return tenantId === undefined ? null : db.orm.public.Tenant.where({ id: tenantId }).first();
}

type PublicProductRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  available: boolean;
  archived: boolean;
  sortOrder: number;
  variations: readonly {
    id: string;
    name: string;
    priceCents: number;
    stockMode: string;
    stockQty: number | null;
  }[];
  tags: readonly { tag: { name: string; isActive: boolean } | null }[];
};

/** The menu's product shape, shared by the listing and the direct URL read. */
export function toPublicProduct(product: PublicProductRow) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    available: product.available,
    archived: product.archived,
    sortOrder: product.sortOrder,
    fromPriceCents: Math.min(...product.variations.map((variation) => variation.priceCents)),
    variations: product.variations.map((variation) => ({
      id: variation.id,
      name: variation.name,
      priceCents: variation.priceCents,
      available: variation.stockMode === "unlimited" || (variation.stockQty ?? 0) > 0,
    })),
    tags: product.tags.flatMap((entry) => (entry.tag?.isActive ? [entry.tag.name] : [])),
  };
}

/** The label row as the `nutrition` include hands it over. */
type PublicNutritionRow = {
  basis: "solid" | "liquid";
  labelFormat: "vertical" | "simplified";
  source: "manual" | "lab" | "supplier_label" | "database" | "estimate";
  referenceAt: Temporal.PlainDateTime | null;
  energyKcal: number | null;
  carbsMg: number | null;
  totalSugarsMg: number | null;
  addedSugarsMg: number | null;
  proteinMg: number | null;
  totalFatMg: number | null;
  saturatedFatMg: number | null;
  transFatMg: number | null;
  fiberMg: number | null;
  sodiumMg: number | null;
  portionMilli: number | null;
  householdMeasure: string | null;
  servingsPerPack: number | null;
  showHighAddedSugar: boolean;
  showHighSatFat: boolean;
  showHighSodium: boolean;
  published: boolean;
  updatedAt: Temporal.PlainDateTime;
};

/**
 * The label a buyer may see. An unpublished row maps to `null`: the read filters
 * on `published` too, and the mapper refuses a draft again, so a caller that
 * forgets the predicate cannot publish half a table by accident.
 *
 * `published` itself, the tenant/product keys and the internal `notes` stay on
 * the server; the %VD and the "Alto em" recommendation are derived by the shared
 * label model, never stored or sent.
 */
export function toPublicNutrition(
  row: PublicNutritionRow | null,
): v.InferOutput<typeof PublicNutritionSchema> | null {
  if (row === null || !row.published) return null;

  return {
    basis: row.basis,
    labelFormat: row.labelFormat,
    source: row.source,
    referenceAt: row.referenceAt === null ? null : toIsoTimestamp(row.referenceAt),
    energyKcal: row.energyKcal,
    carbsMg: row.carbsMg,
    totalSugarsMg: row.totalSugarsMg,
    addedSugarsMg: row.addedSugarsMg,
    proteinMg: row.proteinMg,
    totalFatMg: row.totalFatMg,
    saturatedFatMg: row.saturatedFatMg,
    transFatMg: row.transFatMg,
    fiberMg: row.fiberMg,
    sodiumMg: row.sodiumMg,
    portionMilli: row.portionMilli,
    householdMeasure: row.householdMeasure,
    servingsPerPack: row.servingsPerPack,
    showHighAddedSugar: row.showHighAddedSugar,
    showHighSatFat: row.showHighSatFat,
    showHighSodium: row.showHighSodium,
    updatedAt: toIsoTimestamp(row.updatedAt),
  };
}

/**
 * The SEO a page renders, resolved the same way the panel resolves it: the
 * entity's own row first, then the store's row, then the store templates, then
 * a static fallback. `canonicalUrl` and `jsonLd` never inherit — a canonical
 * URL or a structured-data block belonging to another page would describe the
 * wrong thing.
 *
 * Every query carries an explicit `tenantId`, so the tenant isolation
 * middleware accepts them without an open scope.
 */
export async function loadResolvedSeo(input: {
  tenantId: string;
  storeName: string;
  entityType: SeoEntityType;
  entityId: string;
  entityName: string;
  fallbackTitle: string;
  fallbackDescription?: string | null;
}): Promise<ResolvedSeo> {
  const storeRowQuery =
    input.entityType === "store"
      ? null
      : db.orm.public.SeoMeta.where({
          tenantId: input.tenantId,
          entityType: "store",
          entityId: input.tenantId,
        }).first();

  const [entityRow, storeRow, settings] = await Promise.all([
    db.orm.public.SeoMeta.where({
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
    }).first(),
    storeRowQuery,
    db.orm.public.StoreSettings.where({ tenantId: input.tenantId }).first(),
  ]);

  return resolveSeo({
    entity: entityRow,
    storeRow,
    settings: settings
      ? {
          seoTitleTemplate: settings.seoTitleTemplate,
          seoDescriptionTemplate: settings.seoDescriptionTemplate,
          seoSocialImageUrl: settings.seoSocialImageUrl,
        }
      : null,
    context: { storeName: input.storeName, entityName: input.entityName },
    fallbackTitle: input.fallbackTitle,
    fallbackDescription: input.fallbackDescription,
  });
}

/** The five SEO fields, as the storefront reads them. */
export function toPublicSeo(resolved: ResolvedSeo): v.InferOutput<typeof publicSeoOutput> {
  return {
    title: resolved.title,
    description: resolved.description,
    socialImageUrl: resolved.socialImageUrl,
    canonicalUrl: resolved.canonicalUrl,
    jsonLd: resolved.jsonLd,
  };
}

/** The direct URL's product: the menu row, the label and its own SEO. */
export function toPublicProductDetail(
  product: PublicProductRow,
  nutrition: PublicNutritionRow | null,
  seo: ResolvedSeo,
): v.InferOutput<typeof PublicProductDetailSchema> {
  return {
    ...toPublicProduct(product),
    nutrition: toPublicNutrition(nutrition),
    seo: toPublicSeo(seo),
  };
}
