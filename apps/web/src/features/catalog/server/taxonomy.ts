/**
 * Taxonomy options for the product form: the subcategories (with their
 * department name), tags and badges a product can reference.
 *
 * One read of four panel lists, shared by the editor and the create page. The
 * response is plain data, so the loader can cache it (`staleTime` on the caller
 * side) exactly like the old per-session cache entry did.
 */
import type { TenantClient } from "@/server/panel-client.ts";

export type SubcategoryOption = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  departmentName: string;
};

export type TaxonomyItem = { id: string; name: string };

export type ProductTaxonomy = {
  subcategories: SubcategoryOption[];
  tags: TaxonomyItem[];
  badges: TaxonomyItem[];
};

/** The four panel lists, merged into the option shapes the form renders. */
export async function loadProductTaxonomy(
  client: TenantClient,
  storeSlug: string,
): Promise<ProductTaxonomy> {
  const [{ categories }, { subcategories }, { tags }, { badges }] = await Promise.all([
    client.panel.listCategories({ storeSlug }),
    client.panel.listSubcategories({ storeSlug }),
    client.panel.listTags({ storeSlug }),
    client.panel.listBadges({ storeSlug }),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return {
    subcategories: subcategories.map((subcategory) => {
      const category = categoryById.get(subcategory.categoryId);

      return {
        id: subcategory.id,
        name: subcategory.name,
        categoryId: subcategory.categoryId,
        categoryName: category?.name ?? "Sem categoria",
        departmentName: category?.departmentNames[0] ?? "Sem departamento",
      };
    }),
    tags,
    // The form picks badge ids; the image is only needed by the badges screen.
    badges: badges.map((badge) => ({ id: badge.id, name: badge.name })),
  };
}
