import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { buildStoreJsonLd } from "@menuza/shared/seo";
import { absoluteUrl } from "@/lib/seo/base-url.ts";
import { JsonLdScript } from "@/lib/seo/json-ld.ts";
import { buildSeoMetadata } from "@/lib/seo/metadata.ts";
import { loadStore } from "../_lib/storefront-data.ts";

/**
 * The store's home. `/store` is the entry route the proxy allows for every
 * storefront host; `/menu` holds the catalog. The tenant comes from the header
 * the proxy wrote, so this page renders per request.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await loadStore();

  if (!store) return { robots: { index: false, follow: false } };

  return await buildSeoMetadata({
    title: store.seo.title || store.displayName,
    description: store.seo.description,
    path: "/store",
    canonicalUrl: store.seo.canonicalUrl,
    socialImageUrl: store.seo.socialImageUrl,
  });
}

export default async function StorefrontHomePage() {
  const store = await loadStore();

  if (!store) notFound();

  const url = await absoluteUrl("/store");
  const imageUrl = store.seo.socialImageUrl ? await absoluteUrl(store.seo.socialImageUrl) : null;

  // A loja pode substituir o grafo inteiro em `SeoMeta.jsonLd`; o construtor é
  // só o padrão. O texto do override é JSON de confiança do painel, ainda assim
  // passa pelo mesmo escape de `<` na renderização.
  const json =
    store.seo.jsonLd ??
    JSON.stringify(buildStoreJsonLd({ name: store.displayName, url, imageUrl }));

  const tagline =
    store.seo.description ?? "Cardápio online da loja, com itens, opções e preços atualizados.";

  return (
    <div className="flex flex-col gap-6">
      <JsonLdScript json={json} />

      <section
        aria-labelledby="store-home-heading"
        className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-6"
      >
        <h1 id="store-home-heading" className="text-2xl font-semibold tracking-tight">
          {store.displayName}
        </h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">{tagline}</p>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/menu" aria-label="Ver o cardápio" />}>Ver o cardápio</Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Cardápio</CardTitle>
            <CardDescription>Itens publicados pela loja, com opções e preços.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="text-sm text-pretty text-muted-foreground">
              Os itens aparecem na ordem definida pela loja, do jeito que são servidos.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" render={<Link href="/menu" aria-label="Ver o cardápio" />}>
              Ver o cardápio
            </Button>
          </CardFooter>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sobre a loja</CardTitle>
            <CardDescription>{store.displayName} atende pelo cardápio online.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-pretty text-muted-foreground">
              Contato, horários de funcionamento e políticas de entrega ainda não são publicados
              nesta loja.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
