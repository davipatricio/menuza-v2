import { cacheLife, cacheTag } from "next/cache";
import { panelClient } from "@/lib/server-tenant.ts";

/**
 * Product-form taxonomy options (categories, departments, tags) shared by the
 * new-product page and the editor. Private cache: browser-scoped, never a
 * shared server cache. 30s is the documented per-link prefetch floor.
 */
export async function getProductTaxonomy(storeSlug: string) {
  "use cache: private";
  cacheTag(`dashboard:taxonomy:${storeSlug}`);
  cacheLife({ stale: 30 });

  const client = await panelClient();

  if (!client) return null;

  const [{ categories }, { departments }, { tags }] = await Promise.all([
    client.panel.listCategories({ storeSlug }),
    client.panel.listDepartments({ storeSlug }),
    client.panel.listTags({ storeSlug }),
  ]);

  return { categories, departments, tags };
}
