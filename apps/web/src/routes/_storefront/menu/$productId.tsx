import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { buildNutritionLabel } from "@menuza/shared/nutrition";
import { buildProductJsonLd } from "@menuza/shared/seo";
import { NutritionLabel } from "@/components/nutrition/nutrition-label.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { FieldDescription } from "@/components/ui/field.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { loadStorefrontProductFn } from "@/features/storefront/server/storefront.functions.ts";
import { formatBrl, formatDateTime } from "@/lib/format.ts";
import { NUTRITION_SOURCE_LABELS } from "@/lib/panel-labels.ts";
import { JsonLdScript } from "@/lib/seo/json-ld.ts";

export const Route = createFileRoute("/_storefront/menu/$productId")({
  loader: async ({ params }) => {
    const loaded = await loadStorefrontProductFn({ data: { productId: params.productId } });

    // An unknown id and a product withdrawn from the showcase are both 404.
    if (!loaded) throw notFound();

    const { product, url } = loaded;

    // A loja pode substituir o grafo inteiro do produto em `SeoMeta.jsonLd`; o
    // construtor é só o padrão. O texto do override é JSON de confiança do
    // painel, ainda assim passa pelo mesmo escape de `<` na renderização.
    const json =
      product.seo.jsonLd ??
      JSON.stringify(
        buildProductJsonLd({
          name: product.name,
          description: product.description,
          url,
          imageUrl: null,
          available: product.available && !product.archived,
          priceCents: product.variations.map((variation) => variation.priceCents),
        }),
      );

    return { product, json };
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;

    if (!product) return { meta: [{ title: "Item · Menuza" }] };

    const price = `A partir de ${formatBrl(product.fromPriceCents)}.`;

    return {
      meta: [
        { title: product.seo.title },
        {
          name: "description",
          content:
            product.seo.description ??
            (product.description ? `${product.description} ${price}` : price),
        },
        ...(product.archived ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
    };
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { product, json } = Route.useLoaderData();

  // O rótulo chega já publicado e filtrado pelo servidor; sem `view`, o
  // construtor usa a porção oficial. Sem rótulo, nada é renderizado.
  const nutrition = product.nutrition;
  const nutritionLabel = nutrition ? buildNutritionLabel(nutrition) : null;

  return (
    <div className="flex flex-col gap-6">
      <JsonLdScript json={json} />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/menu" aria-label="Voltar ao cardápio" />}>
              Cardápio
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {product.badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {product.badges.map((badge) => (
            <div key={badge.id} className="inline-flex items-center gap-1.5" title={badge.name}>
              {/* eslint-disable-next-line nextjs/no-img-element -- badge images are arbitrary tenant URLs */}
              <img
                src={badge.imageUrl}
                alt={badge.name}
                className="h-7 w-auto max-w-28 object-contain"
              />
            </div>
          ))}
        </div>
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>

      {product.imageUrl ? (
        <div className="relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line nextjs/no-img-element -- tenant asset, not a Next app */}
          <img
            src={product.imageUrl}
            alt={product.name}
            fetchPriority="high"
            className="size-full object-cover"
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-pretty whitespace-pre-line text-muted-foreground">
            {product.description ?? "A loja ainda não descreveu este item."}
          </p>
          {product.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {product.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {product.archived ? (
            <Alert>
              <AlertTitle>Pausado temporariamente</AlertTitle>
              <AlertDescription>
                A loja pausou este item por tempo indeterminado. Confira as outras opções do
                cardápio.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {nutrition && nutritionLabel ? (
        <>
          <Separator />

          <Card>
            <CardHeader>
              <CardTitle>Informação nutricional</CardTitle>
              <CardDescription>
                {`Valores por 100 ${nutritionLabel.unit} e por porção, informados pela loja.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NutritionLabel model={nutritionLabel} />
              <p className="mt-3 text-xs text-pretty text-muted-foreground">
                {`Fonte: ${NUTRITION_SOURCE_LABELS[nutrition.source]} · atualizado em ${formatDateTime(
                  nutrition.referenceAt ?? nutrition.updatedAt,
                )}.`}
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Opções e preços</CardTitle>
          <CardDescription>Escolha uma opção ao montar o pedido com a loja.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opção</TableHead>
                <TableHead className="text-right">Preço</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variations.map((variation) => (
                <TableRow key={variation.id}>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-wrap items-center gap-2">
                      {variation.name}
                      {variation.available ? null : <Badge variant="outline">Indisponível</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBrl(variation.priceCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button disabled aria-describedby="cart-helper">
                Adicionar ao carrinho
              </Button>
            </TooltipTrigger>
            <TooltipContent>O carrinho ainda não está disponível nesta loja</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <FieldDescription id="cart-helper">
          O carrinho ainda não está disponível nesta loja. Em breve você poderá montar o pedido por
          aqui.
        </FieldDescription>
      </div>
    </div>
  );
}
