import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import { KitComposer } from "@/features/storefront/components/kit-composer.tsx";
import { loadStorefrontKitFn } from "@/features/storefront/server/storefront.functions.ts";

export const Route = createFileRoute("/_storefront/menu/kit/$slug")({
  loader: async ({ params }) => {
    const result = await loadStorefrontKitFn({ data: { slug: params.slug } });

    if (!result) throw notFound();

    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Kit · Menuza" }] };

    const { kit, url } = loaderData;
    const canonical = kit.seo.canonicalUrl ?? url;

    const extraLinks = kit.seo.links.map((link) => ({
      rel: link.rel,
      href: link.href,
      hrefLang: link.hreflang ?? undefined,
    }));

    const json =
      kit.seo.jsonLd ??
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: kit.name,
        description: kit.description ?? undefined,
        image: kit.imageUrl,
        url,
        offers: {
          "@type": "Offer",
          price: (kit.baseCents / 100).toFixed(2),
          priceCurrency: "BRL",
          availability: kit.available
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      });

    return {
      meta: [
        { title: kit.seo.title },
        { name: "description", content: kit.seo.description ?? kit.description ?? "" },
      ],
      links: [{ rel: "canonical", href: canonical }, ...extraLinks],
      scripts: [{ type: "application/ld+json", children: json }],
    };
  },
  component: KitPage,
});

function KitPage() {
  const { kit } = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/menu" />}>Cardápio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{kit.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <KitComposer kit={kit} />
    </div>
  );
}
