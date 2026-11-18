/**
 * Avisos de SEO: nunca bloqueiam o salvamento, só apontam o que costuma custar
 * CTR ou confundir o crawler. O servidor é a autoridade dos limites duros; esta
 * lista é o retorno visual enquanto o lojista digita.
 */
import type { SeoLink } from "@menuza/shared/seo";
import { analyzeJsonLd } from "@menuza/shared/seo";

export interface SeoWarningInput {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  jsonLd: string | null;
  links: SeoLink[];
  /** URL absoluta da página, usada para comparar o host do canônico. */
  pageUrl: string | null;
}

export interface SeoWarning {
  field: "title" | "description" | "canonicalUrl" | "jsonLd" | "links";
  message: string;
}

const TITLE_RECOMMENDED = 60;

const DESCRIPTION_RECOMMENDED = 155;

export function seoWarnings(input: SeoWarningInput): SeoWarning[] {
  const warnings: SeoWarning[] = [];

  if (input.title && input.title.length > TITLE_RECOMMENDED) {
    warnings.push({
      field: "title",
      message: `O título tem ${input.title.length} caracteres; a busca costuma cortar acima de ${TITLE_RECOMMENDED}.`,
    });
  }

  if (input.description && input.description.length > DESCRIPTION_RECOMMENDED) {
    warnings.push({
      field: "description",
      message: `A descrição tem ${input.description.length} caracteres; a busca costuma cortar acima de ${DESCRIPTION_RECOMMENDED}.`,
    });
  }

  const pageHost = hostOf(input.pageUrl);
  const canonicalHost = hostOf(input.canonicalUrl);

  if (pageHost && canonicalHost && pageHost !== canonicalHost) {
    warnings.push({
      field: "canonicalUrl",
      message: `O canônico aponta para ${canonicalHost}, mas esta página é servida em ${pageHost}.`,
    });
  }

  const seenHref = new Map<string, number>();

  input.links.forEach((link, index) => {
    const href = link.href.trim();

    if (href === "") return;

    const first = seenHref.get(href);

    if (first !== undefined) {
      warnings.push({
        field: "links",
        message: `O link ${index + 1} repete a mesma URL do link ${first + 1}.`,
      });
    } else {
      seenHref.set(href, index);
    }
  });

  const seenHreflang = new Map<string, number>();

  input.links.forEach((link, index) => {
    const hreflang = link.hreflang?.trim().toLowerCase();

    if (!hreflang) return;

    const first = seenHreflang.get(hreflang);

    if (first !== undefined) {
      warnings.push({
        field: "links",
        message: `O idioma "${hreflang}" aparece nos links ${first + 1} e ${index + 1}.`,
      });
    } else {
      seenHreflang.set(hreflang, index);
    }
  });

  const jsonLdUrl = urlFromJsonLd(input.jsonLd);
  const effectiveCanonical = input.canonicalUrl?.trim() || input.pageUrl;

  if (jsonLdUrl && effectiveCanonical && jsonLdUrl !== effectiveCanonical) {
    warnings.push({
      field: "jsonLd",
      message: "A URL do JSON-LD é diferente do canônico efetivo desta página.",
    });
  }

  return warnings;
}

function hostOf(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/** O primeiro `url` do grafo, que é o que o Google lê como página do item. */
function urlFromJsonLd(json: string | null): string | null {
  if (!json || json.trim() === "") return null;

  const node = analyzeJsonLd(json).document?.nodes.find((entry) => entry.url);

  return node?.url ?? null;
}
