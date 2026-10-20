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
import { publicMenuOutput, publicStoreOutput, PublicProductSchema } from "@menuza/shared/commerce";
import { storefrontClient } from "@/lib/server-api.ts";

export type StorefrontStore = v.InferOutput<typeof publicStoreOutput>;

export type StorefrontMenu = v.InferOutput<typeof publicMenuOutput>;

export type StorefrontProduct = v.InferOutput<typeof PublicProductSchema>;

export const loadStore = cache(async (): Promise<StorefrontStore | null> => {
  const client = await storefrontClient();

  return client ? await client.public.getStore({}) : null;
});

export const loadMenu = cache(async (): Promise<StorefrontMenu | null> => {
  const client = await storefrontClient();

  return client ? await client.public.listMenu({}) : null;
});

/** Categorias e itens soltos na mesma lista, na ordem em que o cardápio mostra. */
export function menuProducts(menu: StorefrontMenu): StorefrontProduct[] {
  return [...menu.categories.flatMap((category) => category.products), ...menu.uncategorized];
}
