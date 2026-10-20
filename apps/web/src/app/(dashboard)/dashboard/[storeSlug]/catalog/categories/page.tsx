import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { TaxonomyCreateDialog } from "../_components/taxonomy-dialog.tsx";
import { CategoriesTable } from "./categories-table";

export default async function CatalogCategoriesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { categories } = await client.panel.listCategories({ storeSlug });

  return (
    <section aria-labelledby="categories-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="categories-heading" className="text-xl font-semibold tracking-tight">
            Categorias
          </h2>
          <p className="text-sm text-muted-foreground">Categorias do catálogo.</p>
        </div>
        <TaxonomyCreateDialog entity="category" storeSlug={storeSlug} />
      </div>
      <CategoriesTable categories={categories} storeSlug={storeSlug} />
    </section>
  );
}
