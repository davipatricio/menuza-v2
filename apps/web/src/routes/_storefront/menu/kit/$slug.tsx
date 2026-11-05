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
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `${loaderData.kit.name} · Menuza` : "Kit · Menuza",
      },
      {
        name: "description",
        content: loaderData?.kit.description ?? "",
      },
    ],
    links: loaderData ? [{ rel: "canonical", href: loaderData.url }] : [],
    scripts: loaderData?.kit.imageUrl
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: loaderData.kit.name,
              description: loaderData.kit.description ?? undefined,
              image: loaderData.kit.imageUrl,
              url: loaderData.url,
              offers: {
                "@type": "Offer",
                price: (loaderData.kit.baseCents / 100).toFixed(2),
                priceCurrency: "BRL",
                availability: loaderData.kit.available
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              },
            }),
          },
        ]
      : [],
  }),
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
