/**
 * `sitemap.xml` por loja.
 *
 * Cada host de tenant tem seu próprio sitemap, montado a partir de
 * `public.listSitemap` (caminhos) + o host resolvido no request. Não há
 * `revalidate` nem `generateStaticParams`: o handler usa header do proxy
 * (`headers()`), que é Request-time API e tira a rota do prerender — sem isso o
 * build gravaria o sitemap de uma única loja para todos os hosts.
 * Host não indexável responde vazio; `robots.ts` já o mantém fora do índice.
 */
import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexableHost } from "@/lib/seo/base-url.ts";
import { storefrontClient } from "@/lib/server-api.ts";

/**
 * Caminho público → caminho desta app. O contrato descreve o catálogo em
 * `/produtos/<id>` e a home em `/`; aqui a home é `/store` e o item é
 * `/menu/<id>`. Prefiro traduzir o prefixo a publicar URL que dá 404, e não
 * emito o que ainda não tem rota.
 */
function publicPath(path: string): string | null {
  if (path === "/") return "/store";

  if (path === "/menu") return "/menu";

  const product = path.startsWith("/produtos/") ? path.slice("/produtos".length) : null;

  return product ? `/menu${product}` : null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await isIndexableHost())) return [];

  const client = await storefrontClient();

  if (!client) return [];

  const [{ entries }, origin] = await Promise.all([
    client.public.listSitemap({}),
    absoluteUrl("/"),
  ]);

  const urls: MetadataRoute.Sitemap = [];

  for (const entry of entries) {
    const path = publicPath(entry.path);

    if (!path) continue;

    urls.push({
      url: new URL(path, origin).toString(),
      lastModified: new Date(entry.lastModified),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    });
  }

  return urls;
}
