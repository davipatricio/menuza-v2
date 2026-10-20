import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { ProductForm } from "../product-form.tsx";

// Reads the session and the store slug on every request, like the shell.
export const instant = false;

/**
 * The product, its taxonomy options and the current SEO in one round trip.
 *
 * An unknown id and another store's id are both `NOT_FOUND`, and both mean a 404
 * here.
 */
async function loadProduct(storeSlug: string, productId: string) {
  const client = await panelClient();

  if (!client) return null;

  try {
    const [{ product }, seo, { categories }, { departments }, { tags }] = await Promise.all([
      client.panel.getProduct({ storeSlug, productId }),
      client.panel.getSeo({ storeSlug, entityType: "product", entityId: productId }),
      client.panel.listCategories({ storeSlug }),
      client.panel.listDepartments({ storeSlug }),
      client.panel.listTags({ storeSlug }),
    ]);

    return { product, seo, categories, departments, tags };
  } catch {
    return null;
  }
}

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; productId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { storeSlug, productId } = await params;
  const { created } = await searchParams;
  const data = await loadProduct(storeSlug, productId);

  if (!data) notFound();

  return (
    <section aria-labelledby="product-edit-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="product-edit-heading" className="text-xl font-semibold tracking-tight">
            Editar produto
          </h2>
          <Badge variant={data.product.available ? "default" : "secondary"}>
            {data.product.available ? "Disponível" : "Indisponível"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {data.product.name}: altere identificação, variações, estoque e SEO.
        </p>
      </div>
      {created ? (
        <Alert>
          <AlertTitle>Produto criado</AlertTitle>
          <AlertDescription>Os dados foram salvos. Agora você pode editar o SEO.</AlertDescription>
        </Alert>
      ) : null}
      <ProductForm
        storeSlug={storeSlug}
        product={data.product}
        seo={data.seo}
        categories={data.categories}
        departments={data.departments}
        tags={data.tags}
      />
    </section>
  );
}
