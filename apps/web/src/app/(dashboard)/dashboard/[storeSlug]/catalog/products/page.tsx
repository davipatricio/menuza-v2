import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { ProductsTable } from "./products-table";

export default async function CatalogProductsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();
  if (!client) notFound();

  const { products } = await client.panel.listProducts({ storeSlug });

  return (
    <section aria-labelledby="products-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="products-heading" className="text-xl font-semibold tracking-tight">Produtos</h2>
        <p className="text-sm text-muted-foreground">Produtos do catálogo com preço padrão.</p>
      </div>
      <ProductsTable
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          categoryName: product.categoryName,
          priceCents: product.priceCents,
          available: product.available,
        }))}
      />
    </section>
  );
}
