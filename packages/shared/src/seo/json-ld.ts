/**
 * JSON-LD: o modelo do bloco e os construtores da loja e do produto.
 *
 * O bloco que o merchant digita é texto livre, então ele é interpretado no
 * limite (valibot) e vira um modelo com nome: um nó, uma lista de nós ou um
 * `@graph`. O resto do app — a validação, a prévia, o painel — só enxerga esse
 * modelo, nunca o JSON cru.
 *
 * Browser-safe: no React, no I/O. Os construtores devolvem objetos simples, e
 * a loja e a vitrine produzem o mesmo bloco a partir dos mesmos dados.
 */
import * as v from "valibot";

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

// --- O modelo do bloco --------------------------------------------------------

/** Texto do bloco: o Schema.org aceita número onde quer string, e nós lemos. */
const jsonLdText = v.pipe(
  v.union([v.string(), v.number(), v.boolean()]),
  v.transform((value) => String(value)),
);

const jsonLdTextList = v.union([jsonLdText, v.array(jsonLdText)]);

/** Uma oferta: `Offer` (um preço) ou `AggregateOffer` (uma faixa). */
export const JsonLdOfferSchema = v.object({
  "@type": v.optional(jsonLdText),
  price: v.optional(jsonLdText),
  lowPrice: v.optional(jsonLdText),
  highPrice: v.optional(jsonLdText),
  priceCurrency: v.optional(jsonLdText),
  availability: v.optional(jsonLdText),
});

export type JsonLdOffer = v.InferOutput<typeof JsonLdOfferSchema>;

/** Um nó do bloco: o que a busca lê de uma entidade. */
export const JsonLdNodeSchema = v.object({
  "@context": v.optional(jsonLdText),
  "@type": v.optional(jsonLdTextList),
  name: v.optional(jsonLdText),
  description: v.optional(jsonLdText),
  url: v.optional(jsonLdText),
  image: v.optional(jsonLdTextList),
  offers: v.optional(v.union([JsonLdOfferSchema, v.array(JsonLdOfferSchema)])),
});

export type JsonLdNode = v.InferOutput<typeof JsonLdNodeSchema>;

/** Um bloco com `@graph`: a lista de nós que a página descreve. */
export const JsonLdGraphSchema = v.object({
  "@graph": v.array(JsonLdNodeSchema),
});

export type JsonLdGraph = v.InferOutput<typeof JsonLdGraphSchema>;

/**
 * O bloco, nas três formas que ele pode ter.
 *
 * A ordem importa: o objeto do valibot aceita um array como objeto vazio, e
 * um `@graph` como nó sem `@graph`. Por isso a lista vem primeiro, e o grafo
 * antes do nó.
 */
export const JsonLdDocumentSchema = v.union([
  v.array(JsonLdNodeSchema),
  JsonLdGraphSchema,
  JsonLdNodeSchema,
]);

export type JsonLdDocumentValue = v.InferOutput<typeof JsonLdDocumentSchema>;

/** O bloco já interpretado: os nós que ele descreve e o contexto do documento. */
export interface JsonLdDocument {
  nodes: JsonLdNode[];
  context: string | null;
}

/** Achata o bloco nas suas três formas: o documento vira uma lista de nós. */
export function toJsonLdDocument(value: JsonLdDocumentValue): JsonLdDocument {
  if (Array.isArray(value)) return { nodes: value, context: null };

  if ("@graph" in value) return { nodes: value["@graph"], context: null };

  return { nodes: [value], context: value["@context"] ?? null };
}
