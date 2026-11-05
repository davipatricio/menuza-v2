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
import type { PublicKit } from "@/lib/api/model";
import { formatBrl } from "@/lib/format.ts";

/** The kit card: image, floor price and how many dishes it carries. */
export function KitCard({ kit }: { kit: PublicKit }) {
  const price =
    kit.pricingMode === "sum"
      ? `a partir de ${formatBrl(kit.baseCents)}`
      : formatBrl(kit.baseCents);

  return (
    <Card
      size="sm"
      aria-disabled={!kit.available}
      className="h-full overflow-hidden aria-disabled:bg-muted/40 aria-disabled:text-muted-foreground"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line nextjs/no-img-element -- tenant asset, not a Next app */}
        <img src={kit.imageUrl} alt={kit.name} loading="lazy" className="size-full object-cover" />
      </div>

      <CardHeader>
        <CardTitle>
          {kit.available ? (
            <Link
              to="/menu/kit/$slug"
              params={{ slug: kit.slug }}
              preload="intent"
              className="underline-offset-4 hover:underline"
            >
              {kit.name}
            </Link>
          ) : (
            kit.name
          )}
        </CardTitle>
        {kit.description ? (
          <CardDescription className="line-clamp-2">{kit.description}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-end gap-2">
        <span className="text-sm font-medium tabular-nums">{price}</span>
        <span className="text-xs text-muted-foreground">
          {kit.items.length === 1 ? "1 prato" : `${kit.items.length} pratos`}
          {kit.percentOff ? ` · ${kit.percentOff}% off` : ""}
        </span>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        {kit.available ? (
          <Button
            size="sm"
            render={
              <Link
                to="/menu/kit/$slug"
                params={{ slug: kit.slug }}
                preload="intent"
                aria-label={`Montar kit: ${kit.name}`}
              />
            }
          >
            Montar kit
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
