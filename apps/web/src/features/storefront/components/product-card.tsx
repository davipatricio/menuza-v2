import { Link } from "@tanstack/react-router";
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
import type { StorefrontMenu } from "@/features/storefront/server/storefront.functions.ts";
import { formatBrl } from "@/lib/format.ts";

type MenuProduct = StorefrontMenu["uncategorized"][number];

/** The catalogue card: image, price, tags and the disabled cart action. */
export function ProductCard({ product }: { product: MenuProduct }) {
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
          {/* eslint-disable-next-line nextjs/no-img-element -- tenant asset, not a Next app */}
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover"
          />
          {product.badges.length > 0 ? (
            <div className="pointer-events-none absolute start-2 top-2 z-10 flex flex-wrap items-center gap-1">
              {product.badges.map((badge) => (
                // eslint-disable-next-line nextjs/no-img-element -- badge images are arbitrary tenant URLs
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
            <Link
              to="/menu/$productId"
              params={{ productId: product.id }}
              preload="intent"
              className="underline-offset-4 hover:underline"
            >
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
            render={
              <Link
                to="/menu/$productId"
                params={{ productId: product.id }}
                preload="intent"
                aria-label={`Ver item: ${product.name}`}
              />
            }
          >
            Ver item
          </Button>
        ) : (
          <Badge variant="outline">Indisponível</Badge>
        )}
        <Button size="sm" variant="outline" disabled>
          Adicionar ao carrinho
        </Button>
      </CardFooter>
    </Card>
  );
}
