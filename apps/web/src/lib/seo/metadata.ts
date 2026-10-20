/**
 * `Metadata` do Next a partir do SEO já resolvido pela API (server-only).
 *
 * Título, descrição e imagem social chegam de `public.getStore`; o caminho
 * canônico fica com quem chama, porque só a página sabe qual é a sua rota. O
 * host absoluto sai do request (`base-url.ts`), nunca de uma constante.
 */
import type { Metadata } from "next";
import { absoluteUrl, isIndexableHost } from "./base-url.ts";

interface SeoMetadataInput {
  title: string;
  description: string | null;
  /** Caminho da própria página (`/menu`, `/menu/<id>`); o host entra depois. */
  path: string;
  /** URL canônica configurada na loja; vence o caminho quando existir. */
  canonicalUrl?: string | null;
  socialImageUrl?: string | null;
}

/**
 * Sempre `og:type` `website`. O Open Graph define `product` como tipo, mas o
 * Next 16.4 valida o valor contra a própria união (`'article' | 'book' | ...
 * | 'video.episode'`) e lança em build/render para qualquer outro; descrever o
 * item pelo JSON-LD `Product` cobre o rich result sem esse risco.
 */
export async function buildSeoMetadata(input: SeoMetadataInput): Promise<Metadata> {
  const { title, description, path, canonicalUrl, socialImageUrl } = input;

  const canonical = canonicalUrl ? canonicalUrl : await absoluteUrl(path);
  const image = socialImageUrl ? await absoluteUrl(socialImageUrl) : null;
  const index = await isIndexableHost();

  const openGraph: NonNullable<Metadata["openGraph"]> = {
    type: "website",
    title,
    url: canonical,
    locale: "pt_BR",
  };

  if (description) openGraph.description = description;

  if (image) openGraph.images = [{ url: image }];

  return {
    title,
    description: description ?? undefined,
    alternates: { canonical },
    openGraph,
    robots: { index, follow: index },
  };
}
