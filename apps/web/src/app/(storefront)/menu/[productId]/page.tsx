import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
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
import { formatBrl } from "@/lib/format.ts";
import { absoluteUrl } from "@/lib/seo/base-url.ts";
import { buildProductJsonLd, JsonLdScript } from "@/lib/seo/json-ld.ts";
import { buildSeoMetadata } from "@/lib/seo/metadata.ts";
import { loadProduct, loadStore, type StorefrontProduct } from "../../_lib/storefront-data.ts";

/** O item do cardápio, ou `null` quando o id não existe ou saiu da vitrine. */
async function findProduct(productId: string): Promise<StorefrontProduct | null> {
  return loadProduct(productId);
}

/**
 * Título/descrição do item, com o preço na descrição: quem vê o link sem abrir a
 * página já sabe o que é e quanto custa. Sem produto, metadata mínima e o
 * `notFound()` da página responde 404.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const [{ productId }, store] = await Promise.all([params, loadStore()]);
  const product = await findProduct(productId);

  if (!store || !product) return { robots: { index: false, follow: false } };

  const price = `A partir de ${formatBrl(product.fromPriceCents)}.`;

  const metadata = await buildSeoMetadata({
    title: product.name,
    description: product.description ? `${product.description} ${price}` : price,
    path: `/menu/${product.id}`,
    socialImageUrl: store.seo.socialImageUrl,
  });

  return product.archived ? { ...metadata, robots: { index: false, follow: false } } : metadata;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = await findProduct(productId);

  // An unknown id and a product withdrawn from the catalog are both 404.
  if (!product) notFound();

  const url = await absoluteUrl(`/menu/${product.id}`);

  // Sempre o construtor: o override de `SeoMeta` é o grafo da loja, e descrever
  // um produto com ele anunciaria a loja como se fosse o item.
  const json = JSON.stringify(
    buildProductJsonLd({
      name: product.name,
      description: product.description,
      url,
      imageUrl: null,
      available: product.available && !product.archived,
      priceCents: product.variations.map((variation) => variation.priceCents),
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <JsonLdScript json={json} />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/menu" aria-label="Voltar ao cardápio" />}>
              Cardápio
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
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
