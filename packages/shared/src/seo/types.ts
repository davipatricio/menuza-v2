/**
 * SEO storage shapes (MEN-233 / MEN-253 / MEN-255).
 *
 * Browser-safe: types only, mirrored from the contract's `seo_entity_type` enum
 * and the `SeoMeta` / `StoreSettings` models. Pure data — resolution lives in
 * `resolve.ts`, token substitution in `tokens.ts`.
 */

/** Mirrors the contract's `seo_entity_type` enum slugs. */
export const SEO_ENTITY_TYPES = [
  "store",
  "department",
  "category",
  "tag",
  "product",
  "kit",
  "coupon",
] as const;

export type SeoEntityType = (typeof SEO_ENTITY_TYPES)[number];

/** The five editable columns of one `SeoMeta` row. */
export interface SeoFields {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  socialImageUrl: string | null;
  jsonLd: string | null;
}

export interface SeoMetaRow extends SeoFields {
  entityType: SeoEntityType;
  entityId: string;
}

/** The store-level defaults (`StoreSettings`), one row per tenant. */
export interface StoreSeoDefaults {
  seoTitleTemplate: string | null;
  seoDescriptionTemplate: string | null;
  seoSocialImageUrl: string | null;
}

/** Values the `%store%` / `%entity%` / `%city%` tokens read. */
export interface SeoContext {
  storeName: string;
  entityName: string;
  city?: string;
}

/** Which inheritance level won the field. `store` covers the settings template too. */
export type SeoSource = "entity" | "store" | "default";

export interface ResolvedSeo {
  title: string;
  description: string | null;
  canonicalUrl: string | null;
  socialImageUrl: string | null;
  jsonLd: string | null;
  source: {
    title: SeoSource;
    description: SeoSource;
    socialImageUrl: SeoSource;
  };
}
