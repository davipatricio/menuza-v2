/**
 * Server function for the taxonomy options the create page needs.
 *
 * The route loader caches it with `staleTime: 30_000` — the same window the old
 * private per-session cache entry had — so opening "Novo produto" twice does not
 * read the four panel lists again.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { panelClient } from "@/server/panel-client.ts";
import { loadProductTaxonomy, type ProductTaxonomy } from "./taxonomy.ts";

export const loadProductTaxonomyFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<ProductTaxonomy | null> => {
    const client = await panelClient();

    if (!client) return null;

    return loadProductTaxonomy(client, data.storeSlug);
  });
