import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UtensilsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { formatBrl } from "@/lib/format.ts";
import { buildSeoMetadata } from "@/lib/seo/metadata.ts";
import {
  loadMenu,
  loadStore,
  menuProducts,
  type StorefrontProduct,
} from "../_lib/storefront-data.ts";

type MenuProduct = StorefrontProduct;

/** "Cardápio de <loja>": o título da loja não serve, porque é o mesmo da home. */
export async function generateMetadata(): Promise<Metadata> {
  const [store, menu] = await Promise.all([loadStore(), loadMenu()]);

  if (!store || !menu) return { robots: { index: false, follow: false } };

  const count = menuProducts(menu).length;

  return await buildSeoMetadata({
    title: `Cardápio de ${store.displayName}`,
    description:
      store.seo.description ??
      `${count} ${count === 1 ? "item" : "itens"} no cardápio de ${store.displayName}.`,
    path: "/menu",
    socialImageUrl: store.seo.socialImageUrl,
  });
}

/** O carrinho ainda não existe; o botão fica desabilitado e explica o motivo. */
function AddToCartButton() {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button size="sm" variant="outline" disabled>
          Adicionar ao carrinho
        </Button>
      </TooltipTrigger>
      <TooltipContent>O carrinho chega em breve</TooltipContent>
    </Tooltip>
  );
}

function ProductCard({ product }: { product: MenuProduct }) {
  const price =
    product.variations.length > 1
      ? `a partir de ${formatBrl(product.fromPriceCents)}`
      : formatBrl(product.variations[0]?.priceCents ?? product.fromPriceCents);

  return (
    <Card
      size="sm"
      aria-disabled={!product.available}
      className="h-full overflow-hidden aria-disabled:bg-muted/40 aria-disabled:text-muted-foreground"
    >
      {product.imageUrl ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
          {product.badges.length > 0 ? (
            <div className="pointer-events-none absolute start-2 top-2 z-10 flex flex-wrap items-center gap-1">
              {product.badges.map((badge) => (
                // eslint-disable-next-line nextjs/no-img-element -- badge images are arbitrary tenant URLs, outside the next/image allowlist
                <img
                  key={badge.id}
                  src={badge.imageUrl}
                  alt={badge.name}
                  loading="lazy"
                  className="h-6 w-auto max-w-20 object-contain drop-shadow-sm"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <CardHeader>
        <CardTitle>
          {product.available ? (
            <Link href={`/menu/${product.id}`} className="underline-offset-4 hover:underline">
              {product.name}
            </Link>
          ) : (
            product.name
          )}
        </CardTitle>
        {product.description ? (
          <CardDescription className="line-clamp-2">{product.description}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-end gap-2">
        <span className="text-sm font-medium tabular-nums">{price}</span>
        {product.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {product.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </span>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        {product.available ? (
          <Button
            size="sm"
            render={<Link href={`/menu/${product.id}`} aria-label={`Ver item: ${product.name}`} />}
          >
            Ver item
          </Button>
        ) : (
          <Badge variant="outline">Indisponível</Badge>
        )}
        <AddToCartButton />
      </CardFooter>
    </Card>
  );
}

export default async function MenuPage() {
  const menu = await loadMenu();

  if (!menu) notFound();

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

      <TooltipProvider>
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
      </TooltipProvider>
    </div>
  );
}
