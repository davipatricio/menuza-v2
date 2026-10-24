/**
 * Commerce / public / listSitemap implementation (MEN-260).
 *
 * Every public page of one store, addressed by path only — the caller prepends
 * its own origin, so the same entries serve the tenant host and any alias.
 *
 * Only `Tenant` carries an `updatedAt` among the models involved (the catalog
 * rows have no timestamp column), so every entry reports the tenant's, which is
 * the last time the store changed at all. Coarse on purpose: a sitemap entry is
 * a hint, and guessing a finer date would mean inventing one.
 */
import { implement } from "@orpc/server";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { db, withTenant } from "@menuza/db";
import { loadTenant, toIsoTimestamp } from "./support.ts";

const os = implement(commerceContractObject);

export const listSitemapImpl = os.public.listSitemap
  .use(tenantMiddleware({ require: "optional" }))
  .handler(async ({ context }) => {
    const tenant = await loadTenant(context.tenantId);

    if (!tenant) return { entries: [] };

    const { categories, departments, tags, products, kits } = await withTenant(
      tenant.id,
      async () => ({
        categories: await db.orm.public.Category.where({ tenantId: tenant.id, active: true })
          .select("id")
          .all(),
        departments: await db.orm.public.Department.where({ tenantId: tenant.id, active: true })
          .select("id")
          .all(),
        tags: await db.orm.public.Tag.where({ tenantId: tenant.id, isActive: true })
          .select("id")
          .all(),
        products: (
          await db.orm.public.Product.where({ tenantId: tenant.id })
            .select("id", "available", "archived", "hidden", "private")
            .all()
        ).filter((row) => row.available && !row.archived && !row.hidden && !row.private),
        kits: await db.orm.public.Kit.where({ tenantId: tenant.id, available: true })
          .select("id")
          .all(),
      }),
    );

    const lastModified = toIsoTimestamp(tenant.updatedAt);

    return {
      entries: [
        { path: "/", changeFrequency: "daily" as const, priority: 1 },
        { path: "/menu", changeFrequency: "daily" as const, priority: 0.9 },
        ...categories.map((row) => ({
          path: `/categorias/${row.id}`,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        })),
        ...products.map((row) => ({
          path: `/produtos/${row.id}`,
          changeFrequency: "daily" as const,
          priority: 0.7,
        })),
        ...departments.map((row) => ({
          path: `/departamentos/${row.id}`,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
        ...tags.map((row) => ({
          path: `/tags/${row.id}`,
          changeFrequency: "weekly" as const,
          priority: 0.5,
        })),
        ...kits.map((row) => ({
          path: `/kits/${row.id}`,
          changeFrequency: "monthly" as const,
          priority: 0.5,
        })),
      ].map((entry) => ({ ...entry, lastModified })),
    };
  });

export type ListSitemapImpl = typeof listSitemapImpl;
