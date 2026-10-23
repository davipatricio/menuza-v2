/**
 * Storefront public read mapping — Unit (infrastructure-free), MEN-260.
 *
 * Only the tag projection needs a test: `toPublicProduct` is the one place the
 * listing and the direct URL read turn the join into buyer-facing names, and it
 * is where an inactive tag has to disappear. No db is faked; the row is the
 * shape the includes hand over.
 */
import { describe, expect, test } from "bun:test";
import { toPublicProduct } from "../src/domains/commerce/subdomains/public/support.ts";

/** One `Product.tags` entry as the `tag` include returns it. */
type ProductTagJoin = { tag: { name: string; isActive: boolean } | null };

/** The slice of a product row `toPublicProduct` reads. */
function productWithTags(tags: ProductTagJoin[]) {
  return {
    id: "product-1",
    name: "Açaí 500ml",
    description: null,
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
