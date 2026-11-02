/**
 * Server function for the products list.
 *
 * The only module the catalog list route imports for panel data, so
 * `src/server/**` stays out of the router's isomorphic module graph. Mirrors
 * `apps/web`'s page: one `panel.listProducts` read, filtered in the loader.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { panelClient } from "@/server/panel-client.ts";

export const listProductsFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      sort: v.optional(
        v.picklist(["sortOrder", "name", "updatedAt", "price", "category", "stock"]),
        "sortOrder",
      ),
      order: v.optional(v.picklist(["asc", "desc"]), "asc"),
    }),
  )
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listProducts({
      storeSlug: data.storeSlug,
      sortBy: data.sort,
      order: data.order,
    });
  });

/** The products-list payload, with `null` already ruled out. */
export type PanelProductsPayload = NonNullable<Awaited<ReturnType<typeof listProductsFn>>>;

/** One row of that payload — the shape the client island renders. */
export type PanelProductList = PanelProductsPayload["products"][number];
