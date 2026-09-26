import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { CatalogTabs } from "./catalog-tabs.tsx";

export default async function CatalogPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const [{ products }, { categories }] = await Promise.all([
    client.panel.listProducts({ storeSlug }),
    client.panel.listCategories({ storeSlug }),
  ]);

  return (
    <section aria-labelledby="catalog-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="catalog-heading" className="text-xl font-semibold tracking-tight">
          Catálogo
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Produtos e categorias da loja. O preço é o da variação padrão.
        </p>
      </div>

      <CatalogTabs products={products} categories={categories} storeSlug={storeSlug} />
    </section>
  );
}
