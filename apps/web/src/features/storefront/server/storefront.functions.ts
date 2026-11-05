/**
 * Public storefront reads.
 *
 * Every tenant decision stays server-side: `storefrontClient()` reads the
 * `x-menuza-tenant-id` header the request middleware wrote from the host, so a
 * client can neither pass nor spoof a tenant id.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import {
  publicMenuOutput,
  publicStoreOutput,
  PublicProductDetailSchema,
} from "@menuza/shared/commerce";
import type * as vv from "valibot";
import type { PublicKit } from "@/lib/api/model";
import { getCommerceStatus, storefrontClient } from "@/server/server-api.ts";
import { absoluteUrl } from "@/server/seo/base-url.ts";

export type StorefrontStore = vv.InferOutput<typeof publicStoreOutput>;

export type StorefrontMenu = vv.InferOutput<typeof publicMenuOutput>;

export type StorefrontProductDetail = vv.InferOutput<typeof PublicProductDetailSchema>;

/** `null` means this host owns no tenant — the caller decides 404 vs minimal head. */
export const loadStorefrontStoreFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<StorefrontStore | null> => {
    const client = await storefrontClient();

    return client ? await client.public.getStore() : null;
  },
);

/** Origins for the store page's JSON-LD, resolved from the request host. */
export const loadStorefrontStoreUrlsFn = createServerFn({ method: "GET" })
  .validator(v.object({ socialImageUrl: v.optional(v.nullable(v.string())) }))
  .handler(async ({ data }) => ({
    url: await absoluteUrl("/store"),
    imageUrl: data.socialImageUrl ? await absoluteUrl(data.socialImageUrl) : null,
  }));

export const loadStorefrontMenuFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<StorefrontMenu | null> => {
    const client = await storefrontClient();

    return client ? await client.public.listMenu() : null;
  },
);

/**
 * One product by id. Unlike the menu, this answers hidden and archived items so
 * the direct URL works; inactive and private come back as `null`.
 */
export const loadStorefrontProductFn = createServerFn({ method: "GET" })
  .validator(v.object({ productId: v.string() }))
  .handler(async ({ data }) => {
    const client = await storefrontClient();

    if (!client) return null;

    const { product } = await client.public.getProduct({ productId: data.productId });

    if (!product) return null;

    return { product, url: await absoluteUrl(`/menu/${product.id}`) };
  });

/** Commerce API health, deferred so the store shell never waits on it. */
export const loadCommerceStatusFn = createServerFn({ method: "GET" }).handler(async () =>
  getCommerceStatus(),
);

/** Itens publicados e itens soltos na mesma lista, na ordem em que o cardápio mostra. */
export function menuProducts(menu: StorefrontMenu) {
  return [
    ...menu.departments.flatMap((department) =>
      department.categories.flatMap((category) =>
        category.subcategories.flatMap((subcategory) => subcategory.products),
      ),
    ),
    ...menu.uncategorized,
  ];
}

/**
 * Kits published by the store, including the ones blocked by composition.
 * The API already hides the `unavailableBehavior: hide` kits.
 */
export const loadStorefrontKitsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicKit[]> => {
    const client = await storefrontClient();

    return client ? (await client.public.listKits()).kits : [];
  },
);

/** One kit by slug. `null` for unknown, archived and hidden kits. */
export const loadStorefrontKitFn = createServerFn({ method: "GET" })
  .validator(v.object({ slug: v.string() }))
  .handler(async ({ data }) => {
    const client = await storefrontClient();

    if (!client) return null;

    const { kit } = await client.public.getKit({ slug: data.slug });

    if (!kit) return null;

    return { kit, url: await absoluteUrl(`/menu/kit/${kit.slug}`) };
  });
