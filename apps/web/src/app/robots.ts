/**
 * `robots.txt` por host.
 *
 * Produção e host principal indexam e apontam para o sitemap da própria loja;
 * qualquer outro caso (desenvolvimento, alias, host sem tenant) fecha tudo com
 * `disallow: "/"`. O host e o modo vêm do proxy, então a rota é dinâmica: um
 * `robots.txt` estático serviria a mesma regra para todas as lojas.
 */
import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexableHost } from "@/lib/seo/base-url.ts";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!(await isIndexableHost())) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: await absoluteUrl("/sitemap.xml"),
  };
}
