import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
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

  return (
    <ProductCrumb productId={product.id} name={product.name}>
      <section aria-labelledby="product-edit-heading" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="product-edit-heading" className="text-xl font-semibold tracking-tight">
                Editar produto
              </h2>
              <Badge variant={product.available ? "default" : "secondary"}>
                {product.available ? "Disponível" : "Indisponível"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {product.name}: altere identificação, variações, estoque e SEO.
            </p>
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
          categories={taxonomy.categories}
          departments={taxonomy.departments}
          tags={taxonomy.tags}
        />
      </section>
    </ProductCrumb>
  );
}
