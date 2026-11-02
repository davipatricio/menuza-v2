import { Await, createFileRoute, defer, Link, notFound } from "@tanstack/react-router";
import { buildStoreJsonLd } from "@menuza/shared/seo";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  CommerceStatusCard,
  CommerceStatusSkeleton,
} from "@/features/storefront/components/commerce-status-card.tsx";
import {
  loadCommerceStatusFn,
  loadStorefrontStoreFn,
  loadStorefrontStoreUrlsFn,
} from "@/features/storefront/server/storefront.functions.ts";
import { JsonLdScript } from "@/lib/seo/json-ld.ts";

export const Route = createFileRoute("/_storefront/store")({
  loader: async () => {
    const store = await loadStorefrontStoreFn();

    if (!store) throw notFound();

    const { url, imageUrl } = await loadStorefrontStoreUrlsFn({
      data: { socialImageUrl: store.seo.socialImageUrl },
    });

    // A loja pode substituir o grafo inteiro em `SeoMeta.jsonLd`; o construtor é
    // só o padrão. O texto do override é JSON de confiança do painel, ainda assim
    // passa pelo mesmo escape de `<` na renderização.
    const json =
      store.seo.jsonLd ??
      JSON.stringify(buildStoreJsonLd({ name: store.displayName, url, imageUrl }));

    return { store, json, commerceStatus: defer(loadCommerceStatusFn()) };
  },
  head: ({ loaderData }) => ({
    // The loader 404s without a store, so the fallback only covers the
    // pre-load render.
    meta: [
      { title: loaderData?.store.seo.title || loaderData?.store.displayName || "Loja" },
      { name: "description", content: loaderData?.store.seo.description ?? "" },
      {
        property: "og:title",
        content: loaderData?.store.seo.title || loaderData?.store.displayName || "Loja",
      },
      { property: "og:description", content: loaderData?.store.seo.description ?? "" },
      ...(loaderData?.store.seo.socialImageUrl
        ? [{ property: "og:image", content: loaderData.store.seo.socialImageUrl }]
        : []),
    ],
  }),
  component: StorefrontHomePage,
});

function StorefrontHomePage() {
  const { store, json, commerceStatus } = Route.useLoaderData();

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
          <Button render={<Link to="/menu" aria-label="Ver o cardápio" />}>Ver o cardápio</Button>
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
            <Button variant="outline" render={<Link to="/menu" aria-label="Ver o cardápio" />}>
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

      <Await promise={commerceStatus} fallback={<CommerceStatusSkeleton />}>
        {(status) => <CommerceStatusCard status={status} />}
      </Await>
    </div>
  );
}
