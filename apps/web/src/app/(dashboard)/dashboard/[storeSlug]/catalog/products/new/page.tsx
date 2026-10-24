import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SimpleLoading } from "../../../_components/simple-loading.tsx";
import { ProductForm } from "../product-form.tsx";
import { getProductTaxonomy } from "../product-taxonomy.ts";

export const instant = true;

export default function NewProductPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  return (
    <Suspense fallback={<SimpleLoading label="Carregando produto" />}>
      <NewProduct params={params} />
    </Suspense>
  );
}

async function NewProduct({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const taxonomy = await getProductTaxonomy(storeSlug);

  if (!taxonomy) notFound();

  return (
    <section aria-labelledby="product-new-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="product-new-heading" className="text-xl font-semibold tracking-tight">
          Novo produto
        </h2>
        <p className="text-sm text-muted-foreground">
          Cadastre o produto, as variações e os preços.
        </p>
      </div>
      <ProductForm
        storeSlug={storeSlug}
        categories={taxonomy.categories}
        departments={taxonomy.departments}
        tags={taxonomy.tags}
      />
    </section>
  );
}
