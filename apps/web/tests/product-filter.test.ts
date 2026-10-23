import { describe, expect, test } from "bun:test";
import {
  buildProductTaxonomy,
  countActiveProductFilters,
  filterProducts,
  sortProducts,
  type SearchableProduct,
} from "../src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/product-filter.ts";
import type { ProductSearchParams } from "../src/app/(dashboard)/dashboard/[storeSlug]/catalog/products/product-search-params.ts";

function product(overrides: Partial<SearchableProduct> = {}): SearchableProduct {
  return {
    id: "p1",
    name: "Café",
    categoryId: "cat-1",
    categoryName: "Bebidas",
    departmentId: "dep-1",
    departmentName: "Cozinha",
    tags: [],
    priceCents: 500,
    available: true,
    archived: false,
    hidden: false,
    private: false,
    sortOrder: 0,
    ...overrides,
  };
}

function filters(overrides: Partial<ProductSearchParams> = {}): ProductSearchParams {
  return {
    q: "",
    status: "all",
    visibility: "all",
    category: "",
    department: "",
    tags: [],
    view: "table",
    priced: false,
    untagged: false,
    ...overrides,
  };
}

const catalog = [
  product({ id: "p1", name: "Café", tags: [{ id: "t1", name: "Quente" }] }),
  product({
    id: "p2",
    name: "Pão",
    categoryId: "cat-2",
    categoryName: "Padaria",
    departmentId: "dep-2",
    departmentName: "Balcão",
    tags: [{ id: "t2", name: "Fresco" }],
    priceCents: null,
    available: false,
  }),
  product({
    id: "p3",
    name: "Suco",
    tags: [
      { id: "t1", name: "Quente" },
      { id: "t2", name: "Fresco" },
    ],
  }),
];

const ids = (rows: SearchableProduct[]) => rows.map((row) => row.id);

describe("filterProducts", () => {
  test("matches the query against name, category, department and tags", () => {
    expect(ids(filterProducts(catalog, filters({ q: "café" })))).toEqual(["p1"]);
    expect(ids(filterProducts(catalog, filters({ q: "  PADARIA " })))).toEqual(["p2"]);
    expect(ids(filterProducts(catalog, filters({ q: "balcão" })))).toEqual(["p2"]);
    expect(ids(filterProducts(catalog, filters({ q: "fresco" })))).toEqual(["p2", "p3"]);
  });

  test("matches description, SEO and variation names", () => {
    const rows = [
      product({ id: "a", description: "Massa artesanal" }),
      product({ id: "b", seoTitle: "Pizza especial", seoDescription: "Forno a lenha" }),
      product({ id: "c", variationNames: ["Grande", "Família"] }),
    ];

    expect(ids(filterProducts(rows, filters({ q: "artesanal" })))).toEqual(["a"]);
    expect(ids(filterProducts(rows, filters({ q: "especial" })))).toEqual(["b"]);
    expect(ids(filterProducts(rows, filters({ q: "lenha" })))).toEqual(["b"]);
    expect(ids(filterProducts(rows, filters({ q: "família" })))).toEqual(["c"]);
  });

  test("filters by status", () => {
    expect(ids(filterProducts(catalog, filters({ status: "active" })))).toEqual(["p1", "p3"]);
    expect(ids(filterProducts(catalog, filters({ status: "inactive" })))).toEqual(["p2"]);
  });

  test("filters by visibility", () => {
    const rows = [
      product({ id: "a" }),
      product({ id: "b", archived: true }),
      product({ id: "c", hidden: true }),
      product({ id: "d", private: true }),
    ];

    expect(ids(filterProducts(rows, filters({ visibility: "archived" })))).toEqual(["b"]);
    expect(ids(filterProducts(rows, filters({ visibility: "hidden" })))).toEqual(["c"]);
    expect(ids(filterProducts(rows, filters({ visibility: "private" })))).toEqual(["d"]);
  });

  test("filters by category and department", () => {
    expect(ids(filterProducts(catalog, filters({ category: "cat-2" })))).toEqual(["p2"]);
    expect(ids(filterProducts(catalog, filters({ department: "dep-1" })))).toEqual(["p1", "p3"]);
  });

  test("tags: any selected tag matches", () => {
    expect(ids(filterProducts(catalog, filters({ tags: ["t1"] })))).toEqual(["p1", "p3"]);
    expect(ids(filterProducts(catalog, filters({ tags: ["t1", "t2"] })))).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  test("filters priced and untagged", () => {
    expect(ids(filterProducts(catalog, filters({ priced: true })))).toEqual(["p1", "p3"]);
    expect(ids(filterProducts(catalog, filters({ untagged: true })))).toEqual([]);
  });
});

describe("sortProducts", () => {
  test("orders by sortOrder, then name (pt-BR), then id", () => {
    const rows = [
      product({ id: "z", name: "Banana" }),
      product({ id: "y", name: "Abacate" }),
      product({ id: "b", name: "Abacate" }),
      product({ id: "a", name: "Abacate" }),
      product({ id: "first", name: "Zucchini", sortOrder: -1 }),
    ];

    expect(ids(sortProducts(rows))).toEqual(["first", "a", "b", "y", "z"]);
  });

  test("is deterministic regardless of input order", () => {
    const forward = sortProducts(catalog);
    const backward = sortProducts([...catalog].reverse());

    expect(ids(forward)).toEqual(ids(backward));
    expect(ids(forward)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("countActiveProductFilters", () => {
  test("counts the advanced filters shown on the badge", () => {
    expect(countActiveProductFilters(filters())).toBe(0);
    expect(
      countActiveProductFilters(
        filters({
          category: "cat-1",
          department: "dep-1",
          visibility: "archived",
          tags: ["t1"],
          priced: true,
          untagged: true,
        }),
      ),
    ).toBe(6);
  });
});

describe("buildProductTaxonomy", () => {
  test("lists distinct options from the unfiltered rows", () => {
    expect(buildProductTaxonomy(catalog)).toEqual({
      categories: [
        { id: "cat-1", name: "Bebidas" },
        { id: "cat-2", name: "Padaria" },
      ],
      departments: [
        { id: "dep-1", name: "Cozinha" },
        { id: "dep-2", name: "Balcão" },
      ],
      tags: [
        { id: "t2", name: "Fresco", count: 2 },
        { id: "t1", name: "Quente", count: 2 },
      ],
    });
  });
});
