import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { CircleCheck } from "lucide-react";
import type { PanelProductDetail } from "@menuza/shared/tenant";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { SimpleLoading } from "../../../_components/simple-loading.tsx";
import { getProductTaxonomy } from "../product-taxonomy.ts";
import { ProductTabs } from "./product-tabs.tsx";
import { ProductCrumb } from "./product-crumb.tsx";
import { DeleteProductButton } from "../product-form.tsx";

export const instant = true;

type EditProductPageProps = {
  params: Promise<{ storeSlug: string; productId: string }>;
  searchParams: Promise<{ created?: string }>;
};

/**
 * The product behind the editor. Private cache: browser-scoped, never a shared
 * server cache. An unknown id and another store's id both fail here and mean a
 * 404.
 */
async function getProductEditor(storeSlug: string, productId: string) {
  "use cache: private";
  cacheTag(`dashboard:product:${storeSlug}:${productId}`);
  cacheLife({ stale: 30 });

  const client = await panelClient();

  if (!client) return null;

  try {
    const { product } = await client.panel.getProduct({ storeSlug, productId });

    return product;
  } catch {
    return null;
  }
}

/** The product's current SEO field values, under its own 30s private entry. */
async function getProductSeo(storeSlug: string, productId: string) {
  "use cache: private";
  cacheTag(`dashboard:seo:${storeSlug}:${productId}`);
  cacheLife({ stale: 30 });

  const client = await panelClient();

  if (!client) return null;

  try {
    return await client.panel.getSeo({ storeSlug, entityType: "product", entityId: productId });
  } catch {
    return null;
  }
}

/** Product, SEO and taxonomy options in one round trip; any API error is a 404. */
async function loadEditor(storeSlug: string, productId: string) {
  try {
    return await Promise.all([
      getProductEditor(storeSlug, productId),
      getProductSeo(storeSlug, productId),
      getProductTaxonomy(storeSlug),
    ]);
  } catch {
    return null;
  }
}

/**
 * One bar, one state. Inactive wins because the product is gone from every
 * surface; then paused, then the visibility modifiers, then active.
 */
function productStatus(
  product: Pick<PanelProductDetail, "available" | "archived" | "hidden" | "private">,
) {
  if (!product.available) {
    return {
      label: "Inativo",
      description: "A URL direta responde 404 e o produto sai do cardápio.",
      bar: "bg-destructive",
    };
  }

  if (product.archived) {
    return {
      label: "Pausado",
      description: "A URL direta mostra o aviso de pausa, mas o produto não aparece no cardápio.",
      bar: "bg-warning",
    };
  }

  if (product.private && product.hidden) {
    return {
      label: "Oculto e privado",
      description: "Some do cardápio e exige uma conta da loja para abrir.",
      bar: "bg-muted-foreground",
    };
  }

  if (product.private) {
    return {
      label: "Privado",
      description: "Exige uma conta da loja para abrir e comprar.",
      bar: "bg-muted-foreground",
    };
  }

  if (product.hidden) {
    return {
      label: "Oculto",
      description: "Some do cardápio, da busca e do sitemap; a URL direta ainda abre.",
      bar: "bg-muted-foreground",
    };
  }

  return {
    label: "Ativo",
    description: "Visível no cardápio, na busca e no sitemap.",
    bar: "bg-success",
  };
}

export default function EditProductPage({ params, searchParams }: EditProductPageProps) {
  return (
    <Suspense fallback={<SimpleLoading label="Carregando produto" />}>
      <EditProduct params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditProduct({ params, searchParams }: EditProductPageProps) {
  const [{ storeSlug, productId }, searchParamsValue] = await Promise.all([params, searchParams]);
  const data = await loadEditor(storeSlug, productId);

  if (!data) notFound();

  const [product, seo, taxonomy] = data;

  if (!product || !seo || !taxonomy) notFound();

  const { created } = searchParamsValue;
  const status = productStatus(product);

  return (
    <ProductCrumb productId={product.id} name={product.name}>
      <section aria-labelledby="product-edit-heading" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              role="img"
              aria-label={`Status do produto: ${status.label}`}
              title={`${status.label}. ${status.description}`}
              className={`h-6 w-1 shrink-0 rounded-full ${status.bar}`}
            />
            <h2 id="product-edit-heading" className="min-w-0 text-xl font-semibold tracking-tight">
              {product.name}
            </h2>
          </div>
          <DeleteProductButton storeSlug={storeSlug} productId={product.id} />
        </div>
        {created ? (
          <Alert>
            <CircleCheck aria-hidden="true" />
            <AlertTitle>Produto criado</AlertTitle>
            <AlertDescription>
              Os dados foram salvos. Agora você pode editar o SEO.
            </AlertDescription>
          </Alert>
        ) : null}
        <ProductTabs
          storeSlug={storeSlug}
          product={product}
          seo={seo}
          subcategories={taxonomy.subcategories}
          tags={taxonomy.tags}
          badges={taxonomy.badges}
        />
      </section>
    </ProductCrumb>
  );
}
