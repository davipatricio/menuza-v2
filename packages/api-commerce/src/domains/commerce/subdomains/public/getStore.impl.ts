/**
 * Commerce / public / getStore implementation (MEN-260).
 *
 * The storefront's identity plus its resolved SEO. Tenant comes from the
 * trusted proxy header (see `support.ts`); a request without one answers
 * `tenantId: null` and empty strings rather than failing.
 */
import { implement } from "@orpc/server";
import { commerceContractObject } from "@menuza/shared/commerce";
import { resolveSeo } from "@menuza/shared/seo";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db } from "@menuza/db";
import { loadTenant } from "./support.ts";

const os = implement(commerceContractObject);

/**
 * The store's SEO: the `entityType: "store"` `SeoMeta` row is the entity, the
 * tenant's `StoreSettings` row carries the templates, and the tenant's
 * `displayName` is the static fallback. `resolveSeo` reads fields per level, so
 * the rows are mapped into the shared shapes instead of passed through.
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

    const [meta, settings] = await Promise.all([
      db.orm.public.SeoMeta.where({
        tenantId: tenant.id,
        entityType: "store",
        entityId: tenant.id,
      }).first(),
      db.orm.public.StoreSettings.where({ tenantId: tenant.id }).first(),
    ]);

    const seo = resolveSeo({
      entity: meta,
      storeRow: null,
      settings,
      context: { storeName: tenant.displayName, entityName: tenant.displayName },
      fallbackTitle: tenant.displayName,
    });

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      displayName: tenant.displayName,
      seo: {
        title: seo.title,
        description: seo.description,
        socialImageUrl: seo.socialImageUrl,
        canonicalUrl: seo.canonicalUrl,
        jsonLd: seo.jsonLd,
      },
    };
  });

export type GetStoreImpl = typeof getStoreImpl;
