/**
 * Pure filtering for the products list. Runs on the server: the panel read is
 * session-scoped, so there is no cross-request `'use cache'`, and ordering is
 * deterministic so the same query always renders the same rows.
 */
import type { PanelProduct } from "@menuza/shared/tenant";
import type { ProductSearchParams } from "./product-search-params.ts";

export type TaxonomyEntry = { id: string; name: string };

/** Tags also carry usage across the unfiltered catalog, to rank the filter list. */
export type TagEntry = TaxonomyEntry & { count: number };

export type ProductTaxonomy = {
  categories: TaxonomyEntry[];
  departments: TaxonomyEntry[];
  tags: TagEntry[];
};

/** List rows carry the extra search fields; the detail shape does not. */
export type SearchableProduct = PanelProduct & {
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  variationNames?: string[];
};

/** The searchable text of one product: identity, SEO, description and taxonomy. */
export function productHaystack(product: SearchableProduct): string {
  return [
    product.name,
    product.description,
    product.seoTitle,
    product.seoDescription,
    ...(product.variationNames ?? []),
    product.categoryName,
    product.departmentName,
    ...product.tags.map((tag) => tag.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Any selected tag matches; the tag buttons are a multi-select, not an AND. */
export function matchesTags(product: PanelProduct, selectedTags: string[]) {
  if (selectedTags.length === 0) return true;

  const productTagIds = new Set(product.tags.map((tag) => tag.id));

  return selectedTags.some((tagId) => productTagIds.has(tagId));
}

export function filterProducts<T extends PanelProduct>(
  products: T[],
  filters: ProductSearchParams,
): T[] {
  const normalizedQuery = filters.q.trim().toLowerCase();

  return products.filter((product) => {
    if (normalizedQuery && !productHaystack(product).includes(normalizedQuery)) return false;

    if (filters.status === "active" && !product.available) return false;

    if (filters.status === "inactive" && product.available) return false;

    if (filters.visibility === "archived" && !product.archived) return false;

    if (filters.visibility === "hidden" && !product.hidden) return false;

    if (filters.visibility === "private" && !product.private) return false;

    if (filters.priced && product.priceCents === null) return false;

    if (filters.untagged && product.tags.length > 0) return false;

    if (filters.category && product.categoryId !== filters.category) return false;

    if (filters.department && product.departmentId !== filters.department) return false;

    return matchesTags(product, filters.tags);
  });
}

/** `sortOrder` asc, then name (pt-BR), then id — total order, no ties. */
export function sortProducts<T extends PanelProduct>(products: T[]): T[] {
  return [...products].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "pt-BR") ||
      a.id.localeCompare(b.id),
  );
}

/** Same semantics as the badge next to "Filtros". */
export function countActiveProductFilters(filters: ProductSearchParams): number {
  return [
    filters.category !== "",
    filters.department !== "",
    filters.visibility !== "all",
    filters.tags.length > 0,
    filters.priced,
    filters.untagged,
  ].filter(Boolean).length;
}

/** Built from the unfiltered rows, so the options never collapse to the result set. */
export function buildProductTaxonomy(products: PanelProduct[]): ProductTaxonomy {
  const categories = new Map<string, string>();
  const departments = new Map<string, string>();
  const tags = new Map<string, TagEntry>();

  for (const product of products) {
    if (product.categoryId && product.categoryName && !categories.has(product.categoryId)) {
      categories.set(product.categoryId, product.categoryName);
    }

    if (product.departmentId && product.departmentName && !departments.has(product.departmentId)) {
      departments.set(product.departmentId, product.departmentName);
    }

    for (const tag of product.tags) {
      const entry = tags.get(tag.id);

      if (entry) entry.count += 1;
      else tags.set(tag.id, { id: tag.id, name: tag.name, count: 1 });
    }
  }

  const toEntries = (map: Map<string, string>): TaxonomyEntry[] =>
    [...map.entries()].map(([id, name]) => ({ id, name }));

  return {
    categories: toEntries(categories),
    departments: toEntries(departments),
    tags: [...tags.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
    ),
  };
}
