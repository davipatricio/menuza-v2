/**
 * Leituras da loja compartilhadas entre `generateMetadata` e a página.
 *
 * `cache()` do React guarda o resultado pelo request: a metadata e o corpo da
 * mesma navegação chamam `loadStore`/`loadMenu` e o RPC acontece uma vez só.
 * `null` significa host sem tenant resolvido pelo proxy — quem chama decide
 * entre `notFound()` e uma metadata mínima.
 */
import { cache } from "react";
import type * as v from "valibot";
import {
  publicMenuOutput,
  publicStoreOutput,
  PublicProductDetailSchema,
  PublicProductSchema,
} from "@menuza/shared/commerce";
import { storefrontClient } from "@/lib/server-api.ts";

export type StorefrontStore = v.InferOutput<typeof publicStoreOutput>;

export type StorefrontMenu = v.InferOutput<typeof publicMenuOutput>;

export type StorefrontProduct = v.InferOutput<typeof PublicProductSchema>;

/**
 * O item da URL direta: o mesmo card do cardápio mais o rótulo publicado. A
 * listagem continua em `StorefrontProduct`, para não carregar nutrição em toda
 * linha do cardápio.
 */
export type StorefrontProductDetail = v.InferOutput<typeof PublicProductDetailSchema>;

export const loadStore = cache(async (): Promise<StorefrontStore | null> => {
  const client = await storefrontClient();

  return client ? await client.public.getStore({}) : null;
});

export const loadMenu = cache(async (): Promise<StorefrontMenu | null> => {
  const client = await storefrontClient();

  return client ? await client.public.listMenu({}) : null;
});

/**
 * One product by id. Unlike the menu, this answers hidden and archived items so
 * the direct URL works; inactive and private come back as `null`.
 */
export const loadProduct = cache(
  async (productId: string): Promise<StorefrontProductDetail | null> => {
    const client = await storefrontClient();

    if (!client) return null;

    const { product } = await client.public.getProduct({ productId });

    return product;
  },
);

/** Itens publicados e itens soltos na mesma lista, na ordem em que o cardápio mostra. */
export function menuProducts(menu: StorefrontMenu): StorefrontProduct[] {
  return [
    ...menu.departments.flatMap((department) =>
      department.categories.flatMap((category) =>
        category.subcategories.flatMap((subcategory) => subcategory.products),
      ),
    ),
    ...menu.uncategorized,
  ];
}
