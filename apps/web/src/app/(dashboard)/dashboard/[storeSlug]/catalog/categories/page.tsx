import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { panelClient } from "@/lib/server-tenant.ts";
import { TableLoading } from "../../_components/table-loading.tsx";
import { TaxonomyCreateDialog } from "../_components/taxonomy-dialog.tsx";
import { CategoriesTable } from "./categories-table";

async function getCategories(storeSlug: string) {
  "use cache: private";
  cacheTag(`dashboard:categories:${storeSlug}`);
  cacheLife({ stale: 300 });
  const client = await panelClient();

  if (!client) return null;
  const { categories } = await client.panel.listCategories({ storeSlug });

  return categories;
}

export const instant = true;

export default function CatalogCategoriesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando categorias" />}>
      <CatalogCategories params={params} />
    </Suspense>
  );
}

async function CatalogCategories({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const categories = await getCategories(storeSlug);

  if (!categories) notFound();

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
