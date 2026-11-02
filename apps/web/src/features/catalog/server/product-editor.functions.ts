/**
 * Server function behind the product editor route: the product, its SEO fields
 * and the taxonomy options in one round trip.
 *
 * The old page wrapped the three reads in a private cache entry with a
 * 30s stale window. Here the route loader owns that window (`staleTime: 30_000`
 * on the query), so this function stays a plain read: no cache directives, no
 * module state.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { PanelProductDetail, PanelSeo } from "@menuza/shared/tenant";
import { panelClient } from "@/server/panel-client.ts";
import { loadProductTaxonomy, type ProductTaxonomy } from "./taxonomy.ts";

export type ProductEditorData = {
  status: "ok";
  product: PanelProductDetail;
  seo: PanelSeo;
  taxonomy: ProductTaxonomy;
};

export type ProductEditorResult =
  | ProductEditorData
  | { status: "unauthenticated" }
  | { status: "not-found" };

export const loadProductEditorFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string(), productId: v.string() }))
  .handler(async ({ data }): Promise<ProductEditorResult> => {
    const client = await panelClient();

    // No panel session: the layout already resolved the store, so the recovery
    // is signing in again, not a 404.
    if (!client) return { status: "unauthenticated" };

    try {
      const [productResult, seo, taxonomy] = await Promise.all([
        client.panel.getProduct({ storeSlug: data.storeSlug, productId: data.productId }),
        client.panel.getSeo({
          storeSlug: data.storeSlug,
          entityType: "product",
          entityId: data.productId,
        }),
        loadProductTaxonomy(client, data.storeSlug),
      ]);

      return { status: "ok", product: productResult.product, seo, taxonomy };
    } catch {
      // An unknown id and another store's id are indistinguishable to the API's
      // authorization and both mean the same thing here: 404.
      return { status: "not-found" };
    }
  });
