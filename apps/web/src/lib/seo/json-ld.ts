/**
 * JSON-LD da loja e do produto (server-only).
 *
 * Os construtores devolvem objetos simples; `JsonLdScript` é o único lugar do
 * app que injeta HTML bruto, e recebe texto já serializado (`JSON.stringify` do
 * construtor, ou o texto gravado em `SeoMeta.jsonLd`) com `<` escapado para que
 * um nome de produto contendo `</script>` não feche a tag.
 */
import { createElement, type ReactElement } from "react";

interface StoreJsonLd {
  "@context": "https://schema.org";
  "@type": "Store";
  name: string;
  url: string;
  image?: string[];
}

interface ProductJsonLd {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  url: string;
  description?: string;
  image?: string[];
  offers: {
    "@type": "AggregateOffer";
    priceCurrency: "BRL";
    lowPrice: string;
    highPrice: string;
    offerCount: number;
    availability: "https://schema.org/InStock" | "https://schema.org/OutOfStock";
  };
}

export interface StoreJsonLdInput {
  name: string;
  url: string;
  imageUrl: string | null;
}

export interface ProductJsonLdInput {
  name: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  available: boolean;
  /** Preços das variações, em centavos (ADR-0006). */
  priceCents: number[];
}

/** Centavos inteiros → decimal BRL, que é o que o Schema.org espera em `price`. */
function toPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function buildStoreJsonLd(input: StoreJsonLdInput): StoreJsonLd {
  const { name, url, imageUrl } = input;
  const jsonLd: StoreJsonLd = { "@context": "https://schema.org", "@type": "Store", name, url };

  if (imageUrl) jsonLd.image = [imageUrl];

  return jsonLd;
}

export function buildProductJsonLd(input: ProductJsonLdInput): ProductJsonLd {
  const { name, description, url, imageUrl, available, priceCents } = input;

  const prices = priceCents.length > 0 ? priceCents : [0];

  const jsonLd: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: toPrice(Math.min(...prices)),
      highPrice: toPrice(Math.max(...prices)),
      offerCount: priceCents.length,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  if (description) jsonLd.description = description;

  if (imageUrl) jsonLd.image = [imageUrl];

  return jsonLd;
}

/**
 * Bloco JSON-LD. O corpo vem serializado do chamador (`JSON.stringify` de um
 * construtor acima, ou o override de `SeoMeta`); o escape de `<` acontece na
 * fronteira, então nenhum texto do usuário chega ao HTML sem passar por ele.
 */
export function JsonLdScript({ json }: { json: string }): ReactElement {
  return createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: json.replaceAll("<", "\\u003c") },
  });
}
