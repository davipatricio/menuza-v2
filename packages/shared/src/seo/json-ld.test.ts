import { describe, expect, test } from "bun:test";
import { buildProductJsonLd, buildStoreJsonLd } from "./json-ld.ts";

describe("buildStoreJsonLd", () => {
  test("describes the store with the schema.org context", () => {
    const jsonLd = buildStoreJsonLd({
      name: "Pão da Vila",
      url: "https://paodavila.menuza.app",
      imageUrl: null,
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Store",
      name: "Pão da Vila",
      url: "https://paodavila.menuza.app",
    });
  });

  test("keeps the image as a list when there is one", () => {
    const jsonLd = buildStoreJsonLd({
      name: "Pão da Vila",
      url: "https://paodavila.menuza.app",
      imageUrl: "https://cdn.menuza.app/loja.jpg",
    });

    expect(jsonLd.image).toEqual(["https://cdn.menuza.app/loja.jpg"]);
  });
});

describe("buildProductJsonLd", () => {
  const base = {
    name: "Pão de queijo",
    description: "Receita da casa.",
    url: "https://paodavila.menuza.app/menu/pao-de-queijo",
    imageUrl: null,
    available: true,
  };

  test("turns cents into the decimal price the schema expects", () => {
    const jsonLd = buildProductJsonLd({ ...base, priceCents: [1990, 2490] });

    expect(jsonLd.offers).toEqual({
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "19.90",
      highPrice: "24.90",
      offerCount: 2,
      availability: "https://schema.org/InStock",
    });
  });

  test("an unavailable product is out of stock", () => {
    const jsonLd = buildProductJsonLd({ ...base, available: false, priceCents: [1990] });

    expect(jsonLd.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  test("a product without variations still carries an offer", () => {
    const jsonLd = buildProductJsonLd({ ...base, priceCents: [] });

    expect(jsonLd.offers.lowPrice).toBe("0.00");
    expect(jsonLd.offers.offerCount).toBe(0);
  });

  test("description and image only appear when there is one", () => {
    const withoutOptionals = buildProductJsonLd({
      ...base,
      description: null,
      priceCents: [1990],
    });

    expect(withoutOptionals.description).toBeUndefined();
    expect(withoutOptionals.image).toBeUndefined();

    const withOptionals = buildProductJsonLd({
      ...base,
      imageUrl: "https://cdn.menuza.app/pao.jpg",
      priceCents: [1990],
    });

    expect(withOptionals.image).toEqual(["https://cdn.menuza.app/pao.jpg"]);
  });
});
