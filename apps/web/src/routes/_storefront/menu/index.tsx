import { createFileRoute, notFound } from "@tanstack/react-router";
import { UtensilsIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { KitCard } from "@/features/storefront/components/kit-card.tsx";
import { ProductCard } from "@/features/storefront/components/product-card.tsx";
import {
  loadStorefrontKitsFn,
  loadStorefrontMenuFn,
  loadStorefrontStoreFn,
  menuProducts,
} from "@/features/storefront/server/storefront.functions.ts";

export const Route = createFileRoute("/_storefront/menu/")({
  loader: async () => {
    const [store, menu, kits] = await Promise.all([
      loadStorefrontStoreFn(),
      loadStorefrontMenuFn(),
      loadStorefrontKitsFn(),
    ]);

    if (!store || !menu) throw notFound();

    return { store, menu, kits };
  },
  head: ({ loaderData }) => ({
    // The storefront layout already 404s an unknown host; the fallback covers the
    // pre-load render only.
    meta: [
      {
        title: loaderData
          ? `Cardápio de ${loaderData.store.displayName} · Menuza`
          : "Cardápio · Menuza",
      },
      {
        name: "description",
        content: loaderData?.store.seo.description ?? "",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { menu, kits } = Route.useLoaderData();

  // The server already drops empty groups, so an empty tree means no items.
  const isEmpty = menu.departments.length === 0 && menu.uncategorized.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Cardápio</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Itens publicados pela loja, com opções e preços.
        </p>
      </div>

      {isEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UtensilsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum item publicado</EmptyTitle>
            <EmptyDescription>
              A loja ainda não publicou itens no cardápio. Volte mais tarde para conferir as opções.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {kits.length > 0 ? (
        <section aria-labelledby="kits" className="flex flex-col gap-4">
          <h2 id="kits" className="text-xl font-semibold">
            Kits
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {kits.map((kit) => (
              <li key={kit.id}>
                <KitCard kit={kit} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {menu.departments.map((department) => (
        <section
          key={department.id}
          aria-labelledby={`department-${department.id}`}
          className="flex flex-col gap-5"
        >
          <h2 id={`department-${department.id}`} className="text-xl font-semibold">
            {department.name}
          </h2>

          {department.categories.map((category) => (
            <section
              key={category.id}
              aria-labelledby={`category-${department.id}-${category.id}`}
              className="flex flex-col gap-4"
            >
              <h3 id={`category-${department.id}-${category.id}`} className="text-lg font-medium">
                {category.name}
              </h3>

              {category.subcategories.map((subcategory) => (
                <section
                  key={subcategory.id}
                  aria-labelledby={`subcategory-${department.id}-${category.id}-${subcategory.id}`}
                  className="flex flex-col gap-3"
                >
                  <h4
                    id={`subcategory-${department.id}-${category.id}-${subcategory.id}`}
                    className="text-sm font-medium text-muted-foreground"
                  >
                    {subcategory.name}
                  </h4>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {subcategory.products.map((product) => (
                      <li key={product.id}>
                        <ProductCard product={product} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))}
        </section>
      ))}

      {menu.uncategorized.length > 0 ? (
        <section aria-labelledby="category-uncategorized" className="flex flex-col gap-3">
          <h2 id="category-uncategorized" className="text-lg font-medium">
            Outros itens
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {menu.uncategorized.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">{menuProducts(menu).length} itens publicados.</p>
    </div>
  );
}
