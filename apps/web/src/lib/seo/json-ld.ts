/**
 * Bloco JSON-LD da vitrine (server-only).
 *
 * O corpo vem serializado do chamador (`JSON.stringify` do construtor em
 * `@menuza/shared/seo`, ou o texto gravado em `SeoMeta.jsonLd`); o escape de `<`
 * acontece na fronteira, então nenhum texto do usuário chega ao HTML sem passar
 * por ele.
 */
import { createElement, type ReactElement } from "react";

export function JsonLdScript({ json }: { json: string }): ReactElement {
  return createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: json.replaceAll("<", "\\u003c") },
  });
}
