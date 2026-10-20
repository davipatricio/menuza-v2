import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { ProductsTable } from "./products-table";

export default async function CatalogProductsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { products } = await client.panel.listProducts({ storeSlug });

  return (
    <section aria-labelledby="products-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="products-heading" className="text-xl font-semibold tracking-tight">
            Produtos
          </h2>
          <p className="text-sm text-muted-foreground">Produtos do catálogo com preço padrão.</p>
        </div>
        <Button
          nativeButton={false}
          render={
            <Link href={`/dashboard/${storeSlug}/catalog/products/new`} aria-label="Novo produto" />
          }
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Novo produto
        </Button>
      </div>
      <ProductsTable
        storeSlug={storeSlug}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          departmentId: product.departmentId,
          departmentName: product.departmentName,
          tags: product.tags,
          priceCents: product.priceCents,
          available: product.available,
        }))}
      />
    </section>
  );
}
