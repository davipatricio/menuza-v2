/**
 * Storefront public read mapping — Unit (infrastructure-free), MEN-260.
 *
 * Two projections carry rules that a database test would not reach: the tag
 * join turns into buyer-facing names (an inactive tag has to disappear) and the
 * nutrition label only crosses the wire when it is published. No db is faked;
 * the row is the shape the includes hand over.
 */
import { describe, expect, test } from "bun:test";
import { resolveSeo } from "@menuza/shared/seo";
import {
  toPublicNutrition,
  toPublicProduct,
  toPublicProductDetail,
  toPublicSeo,
} from "../src/domains/commerce/subdomains/public/support.ts";

/** One `Product.tags` entry as the `tag` include returns it. */
type ProductTagJoin = { tag: { name: string; isActive: boolean } | null };

/** One `Product.badges` entry as the `badge` include returns it. */
type ProductBadgeJoin = {
  badge: { id: string; name: string; imageUrl: string; sortOrder: number } | null;
};

/** The slice of a product row `toPublicProduct` reads. */
function productWithTags(tags: ProductTagJoin[], badges: ProductBadgeJoin[] = []) {
  return {
    id: "product-1",
    name: "Açaí 500ml",
    description: null,
    imageUrl: null,
    available: true,
    archived: false,
    sortOrder: 0,
    variations: [
      {
        id: "variation-1",
        name: "Padrão",
        priceCents: 1800,
        stockMode: "unlimited",
        stockQty: null,
      },
    ],
    tags,
    badges,
  };
}

describe("toPublicProduct tags", () => {
  test("keeps an active tag", () => {
    const product = productWithTags([{ tag: { name: "Vegano", isActive: true } }]);

    expect(toPublicProduct(product).tags).toEqual(["Vegano"]);
  });

  test("drops an inactive tag and keeps the active one", () => {
    const product = productWithTags([
      { tag: { name: "Vegano", isActive: true } },
      { tag: { name: "Promoção", isActive: false } },
    ]);

    expect(toPublicProduct(product).tags).toEqual(["Vegano"]);
  });

  test("tolerates a null tag join", () => {
    const product = productWithTags([{ tag: null }]);

    expect(toPublicProduct(product).tags).toEqual([]);
  });
});

describe("toPublicProduct badges", () => {
  test("maps the active badge rows to id, name and image", () => {
    const product = productWithTags(
      [],
      [
        {
          badge: {
            id: "badge-1",
            name: "Novo",
            imageUrl: "https://cdn.menuza.app/novo.png",
            sortOrder: 0,
          },
        },
      ],
    );

    expect(toPublicProduct(product).badges).toEqual([
      { id: "badge-1", name: "Novo", imageUrl: "https://cdn.menuza.app/novo.png" },
    ]);
  });

  // The join row carries no order of its own, so `sortOrder` decides which
  // badge wins the left-most overlay slot.
  test("orders badges by sortOrder, not by join order", () => {
    const product = productWithTags(
      [],
      [
        {
          badge: { id: "b-2", name: "Artesanal", imageUrl: "https://x/2.png", sortOrder: 20 },
        },
        { badge: { id: "b-1", name: "Novo", imageUrl: "https://x/1.png", sortOrder: 10 } },
      ],
    );

    expect(toPublicProduct(product).badges.map((badge) => badge.id)).toEqual(["b-1", "b-2"]);
  });

  test("drops a null badge join and tolerates no badges at all", () => {
    expect(toPublicProduct(productWithTags([], [{ badge: null }])).badges).toEqual([]);
    expect(
      toPublicProduct({
        id: "product-1",
        name: "Açaí",
        description: null,
        imageUrl: null,
        available: true,
        archived: false,
        sortOrder: 0,
        variations: [],
        tags: [],
      }).badges,
    ).toEqual([]);
  });
});

/** One `ProductNutrition` row as the `nutrition` include hands it over. */
type NutritionRow = {
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
  notes: string | null;
  tenantId: string;
  productId: string;
  updatedAt: Temporal.PlainDateTime;
};

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

function nutritionRow(overrides: Partial<NutritionRow> = {}): NutritionRow {
  return {
    basis: "solid",
    labelFormat: "vertical",
    source: "lab",
    referenceAt: at("2026-08-14 00:00"),
    energyKcal: 240,
    carbsMg: 30_000,
    totalSugarsMg: 5_000,
    addedSugarsMg: 2_000,
    proteinMg: 8_000,
    totalFatMg: 6_000,
    saturatedFatMg: 2_000,
    transFatMg: 0,
    fiberMg: 3_000,
    sodiumMg: 180,
    portionMilli: 30_000,
    householdMeasure: "1 fatia",
    servingsPerPack: 1,
    showHighAddedSugar: true,
    showHighSatFat: false,
    showHighSodium: false,
    published: true,
    notes: "Anotação interna da loja",
    tenantId: "tenant-1",
    productId: "product-1",
    updatedAt: at("2026-10-24 16:08"),
    ...overrides,
  };
}

describe("toPublicNutrition", () => {
  test("maps a published row to the contract's shape", () => {
    const nutrition = toPublicNutrition(nutritionRow());

    expect(nutrition).not.toBeNull();
    expect(nutrition?.basis).toBe("solid");
    expect(nutrition?.labelFormat).toBe("vertical");
    expect(nutrition?.source).toBe("lab");
    expect(nutrition?.energyKcal).toBe(240);
    expect(nutrition?.sodiumMg).toBe(180);
    expect(nutrition?.portionMilli).toBe(30_000);
    expect(nutrition?.householdMeasure).toBe("1 fatia");
    expect(nutrition?.showHighAddedSugar).toBe(true);
    // Both columns are UTC-naive; the wire wants the designator back.
    expect(nutrition?.referenceAt).toBe("2026-08-14T00:00:00Z");
    expect(nutrition?.updatedAt).toBe("2026-10-24T16:08:00Z");
  });

  test("ships exactly the contract's fields, never the internal ones", () => {
    const nutrition = toPublicNutrition(nutritionRow());

    expect(Object.keys(nutrition ?? {}).sort()).toEqual(
      [
        "addedSugarsMg",
        "basis",
        "carbsMg",
        "energyKcal",
        "fiberMg",
        "householdMeasure",
        "labelFormat",
        "portionMilli",
        "proteinMg",
        "referenceAt",
        "saturatedFatMg",
        "servingsPerPack",
        "showHighAddedSugar",
        "showHighSatFat",
        "showHighSodium",
        "sodiumMg",
        "source",
        "totalFatMg",
        "totalSugarsMg",
        "transFatMg",
        "updatedAt",
      ].sort(),
    );

    expect(nutrition).not.toHaveProperty("published");
    expect(nutrition).not.toHaveProperty("notes");
    expect(nutrition).not.toHaveProperty("tenantId");
    expect(nutrition).not.toHaveProperty("productId");
  });

  test("an unpublished row maps to null, complete or not", () => {
    expect(toPublicNutrition(nutritionRow({ published: false }))).toBeNull();
  });

  test("a product with no label maps to null", () => {
    expect(toPublicNutrition(null)).toBeNull();
  });
});

/** The SEO a product page renders: its own override, resolved. */
const resolvedSeo = resolveSeo({
  entity: {
    entityType: "product",
    entityId: "product-1",
    title: "Marmita vegana",
    description: "Sem lactose.",
    canonicalUrl: "https://paodavila.menuza.app/menu/marmita-vegana",
    socialImageUrl: "https://cdn.menuza.app/marmita.jpg",
    jsonLd: '{"@type":"Product"}',
  },
  storeRow: null,
  settings: null,
  context: { storeName: "Pão da Vila", entityName: "Marmita vegana" },
  fallbackTitle: "Marmita vegana",
});

describe("toPublicSeo", () => {
  test("maps the resolved fields to the contract's shape", () => {
    expect(toPublicSeo(resolvedSeo)).toEqual({
      title: "Marmita vegana",
      description: "Sem lactose.",
      socialImageUrl: "https://cdn.menuza.app/marmita.jpg",
      canonicalUrl: "https://paodavila.menuza.app/menu/marmita-vegana",
      jsonLd: '{"@type":"Product"}',
    });
  });

  test("a product without an override keeps the fallback title", () => {
    const fallback = resolveSeo({
      entity: null,
      storeRow: null,
      settings: null,
      context: { storeName: "Pão da Vila", entityName: "Marmita vegana" },
      fallbackTitle: "Marmita vegana",
    });

    expect(toPublicSeo(fallback).title).toBe("Marmita vegana");
    expect(toPublicSeo(fallback).jsonLd).toBeNull();
    expect(toPublicSeo(fallback).canonicalUrl).toBeNull();
  });
});

describe("toPublicProductDetail", () => {
  test("adds the published label to the menu row", () => {
    const detail = toPublicProductDetail(
      {
        id: "product-1",
        name: "Marmita vegana",
        description: null,
        imageUrl: null,
        available: true,
        archived: false,
        sortOrder: 0,
        variations: [
          {
            id: "variation-1",
            name: "Padrão",
            priceCents: 1990,
            stockMode: "unlimited",
            stockQty: null,
          },
        ],
        tags: [{ tag: { name: "Vegano", isActive: true } }],
      },
      nutritionRow(),
      resolvedSeo,
    );

    expect(detail.name).toBe("Marmita vegana");
    expect(detail.imageUrl).toBeNull();
    expect(detail.fromPriceCents).toBe(1990);
    expect(detail.tags).toEqual(["Vegano"]);
    expect(detail.nutrition?.energyKcal).toBe(240);
    expect(detail.seo.title).toBe("Marmita vegana");
    expect(detail.seo.jsonLd).toBe('{"@type":"Product"}');
  });

  test("keeps the product and answers null for an unpublished label", () => {
    const product = {
      id: "product-1",
      name: "Marmita vegana",
      description: null,
      imageUrl: null,
      available: true,
      archived: false,
      sortOrder: 0,
      variations: [
        {
          id: "variation-1",
          name: "Padrão",
          priceCents: 1990,
          stockMode: "unlimited",
          stockQty: null,
        },
      ],
      tags: [],
    };

    const detail = toPublicProductDetail(product, nutritionRow({ published: false }), resolvedSeo);

    expect(detail.id).toBe("product-1");
    expect(detail.nutrition).toBeNull();
    expect(detail.seo.title).toBe("Marmita vegana");
  });
});
