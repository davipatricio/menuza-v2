/**
 * Commerce / public / getStore implementation (MEN-260).
 *
 * The storefront's identity plus its resolved SEO. Tenant comes from the
 * trusted proxy header (see `support.ts`); a request without one answers
 * `tenantId: null` and empty strings rather than failing.
 */
import { implement } from "@orpc/server";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { loadResolvedSeo, loadTenant, toPublicSeo } from "./support.ts";

const os = implement(commerceContractObject);

/**
 * The store's SEO: the `entityType: "store"` `SeoMeta` row is the entity, the
 * tenant's `StoreSettings` row carries the templates, and the tenant's
 * `displayName` is the static fallback. `loadResolvedSeo` reads fields per
 * level, so the panel and the storefront resolve them the same way.
 */
export const getStoreImpl = os.public.getStore
  .use(tenantMiddleware({ require: "optional" }))
  .handler(async ({ context }) => {
    const tenant = await loadTenant(context.tenantId);

    if (!tenant) {
      return {
        tenantId: null,
        slug: "",
        displayName: "",
        seo: {
          title: "",
          description: null,
          socialImageUrl: null,
          canonicalUrl: null,
          jsonLd: null,
        },
      };
    }

    const seo = await loadResolvedSeo({
      tenantId: tenant.id,
      storeName: tenant.displayName,
      entityType: "store",
      entityId: tenant.id,
      entityName: tenant.displayName,
      fallbackTitle: tenant.displayName,
    });

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      displayName: tenant.displayName,
      seo: toPublicSeo(seo),
    };
  });

export type GetStoreImpl = typeof getStoreImpl;
